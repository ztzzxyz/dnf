	
// 入口点
// int frida_main(lua_State* ls, const char* args);
function frida_main(ls, _args) {
	// args是lua调用时传过来的字符串
	// 建议约定lua和js通讯采用json格式
	const args = _args.readUtf8String();

	// 在这里做你需要的事情
	console.log('frida main, args = ' + args);

	return 0;
}

// 当lua调用js时触发
// int frida_handler(lua_State* ls, int arg1, float arg2, const char* arg3);
function frida_handler(ls, arg1, arg2, _arg3) {
	const arg3 = _arg3.readUtf8String();

	// GM指令处理 (arg1 == 1, 由lua的GmInput hook调过来)
	if (arg1 == 1) {
		try {
			var data = JSON.parse(arg3);
			var user_ptr_str = data.user_ptr;
			if (user_ptr_str.indexOf("userdata: ") == 0) {
				user_ptr_str = user_ptr_str.substring("userdata: ".length);
			}
			var user = ptr(user_ptr_str);

			var cmd = data.cmd;
			console.log('GM Command: ' + cmd);
			// renwu: 完成任务
			if (cmd == 'renwu') {
				finish_one_doing_quest(user, 1);
				return 0;
			}
			// item 物品ID 数量: 发送物品
			if (cmd.indexOf('item ') == 0) {
				var args = cmd.split(' ');
				if (args.length == 3) {
					var item_id = parseInt(args[1]);
					var item_cnt = parseInt(args[2]);
					api_CUser_AddItem(user, item_id, item_cnt);
					return 0;
				}
			}
		} catch (e) {
			console.log('GM Command Error: ' + e);
		}
		return 0;
	}

	// 如果需要通讯, 在这里编写逻辑
	// 比如: arg1是功能号, arg3是数据内容 (建议json格式)

	// just for test
	dp2_lua_call(arg1, arg2, arg3)

	return 0;
}

// 获取dp2的符号
// void* dp2_frida_resolver(const char* fname);
var __dp2_resolver = null;
function dp2_resolver(fname) {
	return __dp2_resolver(Memory.allocUtf8String(fname));
}

// 通讯 (调用lua)
// int lua_call(int arg1, float arg2, const char* arg3);
var __dp2_lua_call = null;
function dp2_lua_call(arg1, arg2, _arg3) {
	var arg3 = null;
	if (_arg3 != null) {
		arg3 = Memory.allocUtf8String(_arg3);
	}
	return __dp2_lua_call(arg1, arg2, arg3);
}

// 准备工作: 安装dp2与frida的互通接口, 并加载主功能
function setup() {
	var addr = Module.getExportByName('libdp2.so', 'dp2_frida_resolver');
	__dp2_resolver = new NativeFunction(addr, 'pointer', ['pointer']);

	addr = dp2_resolver('lua.call');
	__dp2_lua_call = new NativeFunction(addr, 'int', ['int', 'float', 'pointer']);

	addr = dp2_resolver('frida.main');
	Interceptor.replace(addr, new NativeCallback(frida_main, 'int', ['pointer', 'pointer']));

	addr = dp2_resolver('frida.handler');
	Interceptor.replace(addr, new NativeCallback(frida_handler, 'int', ['pointer', 'int', 'float', 'pointer']));

	Interceptor.flush();

	hook_history_log();
	console.log('hook_history_log --- OK');

	hook_encrypt();
	console.log('hook_encrypt --- OK');

	start();
	console.log('start --- OK');

	hook_TimerDispatcher_dispatch();
}

//延迟加载插件
function awake() {
    //Hook check_argv
    Interceptor.attach(ptr(0x829EA5A), {

        onEnter: function(args) {},
        onLeave: function(retval) {
            //等待check_argv函数执行结束 再加载插件
            setup();
        }
    });
}

rpc.exports = {
    init: function (stage, parameters)
	{
		console.log('frida init stage = ' + stage);
		if (stage == 'early') {
			//首次加载插件 直接加载(参考yt分支, awake延迟加载已注释)
			//awake();
			setup();
		} else {
			//热重载 直接加载
			setup();
		}
	},
	dispose: function ()
	{
		uninit_db();
		console.log('frida dispose');
	}
};

//线程安全锁
var Guard_Mutex_guard = new NativeFunction(ptr(0x810544C), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var Destroy_guard_Mutex_guard = new NativeFunction(ptr(0x8105468), 'int', ['pointer'], {"abi":"sysv"});

//服务器内置定时器队列
var G_TimerQueue = new NativeFunction(ptr(0x80F647C), 'pointer', [], {"abi":"sysv"});

//申请锁(申请后务必手动释放!!!)
function api_guard_Mutex_guard()
{
    var a1 = Memory.alloc(100);
    Guard_Mutex_guard(a1, G_TimerQueue().add(16));

    return a1;
}

//需要在dispatcher线程执行的任务队列(热加载后会被清空)
var timer_dispatcher_list = [];

//在dispatcher线程执行(args为函数f的参数组成的数组, 若f无参数args可为null)
function api_scheduleOnMainThread(f, args)
{
    //线程安全
    var guard = api_guard_Mutex_guard();

    timer_dispatcher_list.push([f, args]);

    Destroy_guard_Mutex_guard(guard);

    return;
}

//设置定时器 到期后在dispatcher线程执行
function api_scheduleOnMainThread_delay(f, args, delay)
{
    setTimeout(api_scheduleOnMainThread, delay, f, args);
}

//处理到期的自定义定时器
function do_timer_dispatch()
{
    //当前待处理的定时器任务列表
    var task_list = [];

    //线程安全
    var guard = api_guard_Mutex_guard();

    //依次取出队列中的任务
    while(timer_dispatcher_list.length > 0)
    {
        //先入先出
        var task = timer_dispatcher_list.shift();
        task_list.push(task);
    }

    Destroy_guard_Mutex_guard(guard);

    //执行任务
    for(var i=0; i<task_list.length; ++i)
    {
        var task = task_list[i];

        var f = task[0];
        var args = task[1];

        f.apply(null, args);
    }
}

//挂接消息分发线程 确保代码线程安全
function hook_TimerDispatcher_dispatch()
{
    //hook TimerDispatcher::dispatch
    //服务器内置定时器 每秒至少执行一次
    Interceptor.attach(ptr(0x8632A18), {

        onEnter: function (args) {
        },
        onLeave: function (retval) {

            //清空等待执行的任务队列
            do_timer_dispatch();
        }
    });
}

//字符串压缩(返回压缩后的指针与长度)	
function api_compress_zip(s)
{
    var input = Memory.allocUtf8String(s);
    var alloc_buf_size = 1000 + strlen(s)*2;
    var output = Memory.alloc(alloc_buf_size);
    var output_len = Memory.alloc(4);
    output_len.writeInt(alloc_buf_size);
    compress_zip(output, output_len, input, strlen(s));

    return [output, output_len.readInt()];
}

//二进制数据解压缩
function api_uncompress_zip(p, len)
{
    var alloc_buf_size = 1000 + (len*10);
    var output = Memory.alloc(alloc_buf_size);
    var output_len = Memory.alloc(4);
    output_len.writeInt(alloc_buf_size);
    uncompress_zip(output, output_len, p, len);

    return output.readUtf8String(output_len.readInt());
}

//背包道具
var Inven_Item_Inven_Item = new NativeFunction(ptr(0x80CB854), 'pointer', ['pointer'], {"abi":"sysv"});
var WongWork_CMailBoxHelper_ReqDBSendNewSystemMultiMail = new NativeFunction(ptr(0x8556B68), 'int', ['pointer', 'pointer', 'int', 'int', 'int', 'pointer', 'int', 'int', 'int', 'int'], {"abi":"sysv"});
var WongWork_CMailBoxHelper_MakeSystemMultiMailPostal = new NativeFunction(ptr(0x8556A14), 'int', ['pointer', 'pointer', 'int'], {"abi":"sysv"});
var std_vector_std_pair_int_int_vector = new NativeFunction(ptr(0x81349D6), 'pointer', ['pointer'], {"abi":"sysv"});
var std_vector_std_pair_int_int_clear = new NativeFunction(ptr(0x817A342), 'pointer', ['pointer'], {"abi":"sysv"});
var std_make_pair_int_int = new NativeFunction(ptr(0x81B8D41), 'pointer', ['pointer', 'pointer', 'pointer'], {"abi":"sysv"});
var std_vector_std_pair_int_int_push_back = new NativeFunction(ptr(0x80DD606), 'pointer', ['pointer', 'pointer'], {"abi":"sysv"});

function api_WongWork_CMailBoxHelper_ReqDBSendNewSystemMultiMail(target_charac_no, title, text, gold, item_list)
{
    //添加道具附件
    var vector = Memory.alloc(100);
    std_vector_std_pair_int_int_vector(vector);
    std_vector_std_pair_int_int_clear(vector);

    for(var i=0; i<item_list.length; ++i)
    {
        var item_id = Memory.alloc(4);          //道具id
        var item_cnt = Memory.alloc(4);         //道具数量

        item_id.writeInt(item_list[i][0]);
        item_cnt.writeInt(item_list[i][1]);

        var pair = Memory.alloc(100);
        std_make_pair_int_int(pair, item_id, item_cnt);

        std_vector_std_pair_int_int_push_back(vector, pair);
    }

    //邮件支持10个道具附件格子
    var addition_slots = Memory.alloc(1000);
    for(var i=0; i<10; ++i)
    {
        Inven_Item_Inven_Item(addition_slots.add(i*61));
    }
    WongWork_CMailBoxHelper_MakeSystemMultiMailPostal(vector, addition_slots, 10);


    var title_ptr = Memory.allocUtf8String(title);      //邮件标题
    var text_ptr = Memory.allocUtf8String(text);        //邮件正文
    var text_len = strlen(text_ptr);                    //邮件正文长度

    //发邮件给角色
    WongWork_CMailBoxHelper_ReqDBSendNewSystemMultiMail(title_ptr, addition_slots, item_list.length, gold, target_charac_no, text_ptr, text_len, 0, 99, 1);
}

//获取背包槽中的道具
var INVENTORY_TYPE_BODY = 0;            //身上穿的装备(0-26)
var INVENTORY_TYPE_ITEM = 1;            //物品栏(0-311)
var INVENTORY_TYPE_AVARTAR = 2;         //时装栏(0-104)
var INVENTORY_TYPE_CREATURE = 3;        //宠物装备(0-241)

//通知客户端更新背包栏
var ENUM_ITEMSPACE_INVENTORY = 0;       //物品栏
var ENUM_ITEMSPACE_AVATAR = 1;          //时装栏
var ENUM_ITEMSPACE_CARGO = 2;           //仓库
var ENUM_ITEMSPACE_CREATURE = 7;        //宠物栏
var ENUM_ITEMSPACE_ACCOUNT_CARGO = 12;  //账号仓库

//完成角色当前可接的所有任务(仅发送金币/经验/QP等基础奖励 无道具奖励)
var QUEST_gRADE_COMMON_UNIQUE = 5;                  //任务脚本中[grade]字段对应的常量定义 可以在importQuestScript函数中找到
var QUEST_gRADE_NORMALY_REPEAT = 4;                 //可重复提交的重复任务
var QUEST_gRADE_DAILY = 3;                          //每日任务
var QUEST_gRADE_EPIC = 0;                           //史诗任务
var QUEST_gRADE_ACHIEVEMENT = 2;                           //史诗任务

//将协议发给所有在线玩家(慎用! 广播类接口必须限制调用频率, 防止CC攻击)
//除非必须使用, 否则改用对象更加明确的CParty::send_to_party/GameWorld::send_to_area
var GameWorld_send_all = new NativeFunction(ptr(0x86C8C14),  'int', ['pointer', 'pointer'], {"abi":"sysv"});
var GameWorld_send_all_with_state = new NativeFunction(ptr(0x86C9184),  'int', ['pointer', 'pointer', 'int'], {"abi":"sysv"});

//获取字符串长度
var strlen = new NativeFunction(Module.getExportByName(null, 'strlen'), 'int', ['pointer'], {"abi":"sysv"});

//获取GameWorld实例
var G_gameWorld = new NativeFunction(ptr(0x80DA3A7), 'pointer', [], {"abi":"sysv"});
//根据server_id查找user
var GameWorld_find_from_world = new NativeFunction(ptr(0x86C4B9C), 'pointer', ['pointer', 'int'], {"abi":"sysv"});
//城镇瞬移
var GameWorld_move_area = new NativeFunction(ptr(0x86C5A84), 'pointer', ['pointer', 'pointer', 'int', 'int', 'int', 'int', 'int', 'int', 'int', 'int', 'int'], {"abi":"sysv"});

//从客户端封包中读取数据
var PacketBuf_get_byte = new NativeFunction(ptr(0x858CF22), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var PacketBuf_get_short = new NativeFunction(ptr(0x858CFC0), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var PacketBuf_get_int = new NativeFunction(ptr(0x858D27E), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var PacketBuf_get_binary = new NativeFunction(ptr(0x858D3B2), 'int', ['pointer', 'pointer', 'int'], {"abi":"sysv"});

var TAIWAN_CAIN = 2;
var DBMgr_GetDBHandle = new NativeFunction(ptr(0x83F523E), 'pointer', ['pointer', 'int', 'int'], {"abi":"sysv"});
var MySQL_MySQL = new NativeFunction(ptr(0x83F3AC8), 'pointer', ['pointer'], {"abi":"sysv"});
var MySQL_init = new NativeFunction(ptr(0x83F3CE4), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_open = new NativeFunction(ptr(0x83F4024), 'int', ['pointer', 'pointer', 'int', 'pointer', 'pointer', 'pointer'], {"abi":"sysv"});
var MySQL_close = new NativeFunction(ptr(0x83F3E74), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_set_query_2 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var MySQL_set_query_3 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'pointer'], {"abi":"sysv"});
var MySQL_set_query_3 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int'], {"abi":"sysv"});
var MySQL_set_query_4 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int'], {"abi":"sysv"});
var MySQL_set_query_5 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int'], {"abi":"sysv"});
var MySQL_set_query_6 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int', 'int'], {"abi":"sysv"});
var MySQL_exec = new NativeFunction(ptr(0x83F4326), 'int', ['pointer', 'int'], {"abi":"sysv"});
var MySQL_exec_query= new NativeFunction(ptr(0x083F5348), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_get_n_rows = new NativeFunction(ptr(0x80E236C), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_fetch = new NativeFunction(ptr(0x83F44BC), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_get_int = new NativeFunction(ptr(0x811692C), 'int', ['pointer', 'int', 'pointer'], {"abi":"sysv"});
var MySQL_get_uint = new NativeFunction(ptr(0x80E22F2), 'int', ['pointer', 'int', 'pointer'], {"abi":"sysv"});
var MySQL_get_ulonglong = new NativeFunction(ptr(0x81754C8), 'int', ['pointer', 'int', 'pointer'], {"abi":"sysv"});
var MySQL_get_ushort = new NativeFunction(ptr(0x8116990), 'int', ['pointer'], {"abi":"sysv"});
var MySQL_get_float = new NativeFunction(ptr(0x844D6D0), 'int', ['pointer', 'int', 'pointer'], {"abi":"sysv"});
var MySQL_get_binary = new NativeFunction(ptr(0x812531A), 'int', ['pointer', 'int', 'pointer', 'int'], {"abi":"sysv"});
var MySQL_get_binary_length = new NativeFunction(ptr(0x81253DE), 'int', ['pointer', 'int'], {"abi":"sysv"});
var MySQL_get_str = new NativeFunction(ptr(0x80ECDEA), 'int', ['pointer', 'int', 'pointer', 'int'], {"abi":"sysv"});
var MySQL_blob_to_str = new NativeFunction(ptr(0x83F452A), 'pointer', ['pointer', 'int', 'pointer', 'int'], {"abi":"sysv"});
var compress_zip = new NativeFunction(ptr(0x86B201F), 'int', ['pointer', 'pointer', 'pointer', 'int'], {"abi":"sysv"});
var uncompress_zip = new NativeFunction(ptr(0x86B2102), 'int', ['pointer', 'pointer', 'pointer', 'int'], {"abi":"sysv"});

//修复金币异常
var CParty_UseAncientDungeonItems_ptr = ptr(0x859EAC2);
var CParty_UseAncientDungeonItems = new NativeFunction(CParty_UseAncientDungeonItems_ptr,  'int', ['pointer', 'pointer', 'pointer', 'pointer'], {"abi":"sysv"});

//获取当前角色id
var CUserCharacInfo_getCurCharacNo = new NativeFunction(ptr(0x80CBC4E), 'int', ['pointer'], {"abi":"sysv"});
//道具是否被锁
var CUser_CheckItemLock = new NativeFunction(ptr(0x8646942), 'int', ['pointer', 'int', 'int'], {"abi":"sysv"});

//获取角色所在队伍
const CUser_GetParty = new NativeFunction(ptr(0x0865514C), 'pointer', ['pointer'], { "abi": "sysv" });
//获取队伍中玩家
const CParty_get_user = new NativeFunction(ptr(0x08145764), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
//读取副本id
var getDungeonIdxAfterClear = new NativeFunction(ptr(0x0867cb90),  'int', ['pointer'], {"abi":"sysv"});
var CItem_getIndex = new NativeFunction(ptr(0x8110c48), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getGrade = new NativeFunction(ptr(0x8110c54), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getItemName = new NativeFunction(ptr(0x811ed82), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getPrice = new NativeFunction(ptr(0x822c84a), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getGenRate = new NativeFunction(ptr(0x822c84a), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getNeedLevel = new NativeFunction(ptr(0x8545fda), 'int', ['pointer'], {"abi":"sysv"});

//获取装备可穿戴等级
var CItem_getUsableLevel = new NativeFunction(ptr(0x80F12EE), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getRarity = new NativeFunction(ptr(0x80f12d6), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getAttachType = new NativeFunction(ptr(0x80f12e2), 'int', ['pointer'], {"abi":"sysv"});
//获取装备[item group name]
var CItem_getItemGroupName = new NativeFunction(ptr(0x80F1312), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getUpSkillType = new NativeFunction(ptr(0x8545fcc), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getGetExpertJobCompoundMaterialVariation = new NativeFunction(ptr(0x850d292), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpertJobCompoundRateVariation = new NativeFunction(ptr(0x850d2aa), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpertJobCompoundResultVariation = new NativeFunction(ptr(0x850d2c2), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpertJobSelfDisjointBigWinRate = new NativeFunction(ptr(0x850d2de), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpertJobSelfDisjointResultVariation = new NativeFunction(ptr(0x850d2f6), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpertJobAdditionalExp = new NativeFunction(ptr(0x850d30e), 'int', ['pointer'], {"abi":"sysv"});
//道具是否为消耗品
var CItem_is_stackable = new NativeFunction(ptr(0x80F12FA), 'int', ['pointer'], {"abi":"sysv"});
var CItem_isPackagable = new NativeFunction(ptr(0x0828b5b4), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getUsablePeriod = new NativeFunction(ptr(0x08110c60), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getExpirationDate = new NativeFunction(ptr(0x080f1306), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getIncreaseStatusIntData = new NativeFunction(ptr(0x08694658), 'int', ['pointer','int','pointer'], {"abi":"sysv"});
var CItem_getIncreaseStatusType =  new NativeFunction(ptr(0x086946b6), 'int', ['pointer'], {"abi":"sysv"});
var CItem_getUsablePvPRank = new NativeFunction(ptr(0x086946c4), 'int', ['pointer'], {"abi":"sysv"});

//获取消耗品类型
var CStackableItem_getItemType = new NativeFunction(ptr(0x8514A84),  'int', ['pointer'], {"abi":"sysv"});
//获取徽章支持的镶嵌槽类型
var CStackableItem_getJewelTargetSocket = new NativeFunction(ptr(0x0822CA28),  'int', ['pointer'], {"abi":"sysv"});
//获取时装管理器
var CInventory_getAvatarItemMgrR = new NativeFunction(ptr(0x80DD576), 'pointer', ['pointer'], {"abi":"sysv"});
//获取道具附加信息
var Inven_Item_get_add_info = new NativeFunction(ptr(0x80F783A), 'int', ['pointer'], {"abi":"sysv"});
//获取时装插槽数据
var WongWork_CAvatarItemMgr_getJewelSocketData = new NativeFunction(ptr(0x82F98F8), 'pointer', ['pointer', 'int'], {"abi":"sysv"});
//背包中删除道具(背包指针, 背包类型, 槽, 数量, 删除原因, 记录删除日志)
var CInventory_delete_item = new NativeFunction(ptr(0x850400C), 'int', ['pointer', 'int', 'int', 'int', 'int', 'int'], {"abi":"sysv"});
//时装镶嵌数据存盘
var DB_UpdateAvatarJewelSlot_makeRequest = new NativeFunction(ptr(0x843081C), 'pointer', ['int', 'int', 'pointer'], {"abi":"sysv"});
//获取装备类型(10=武器 11=称号 12=上衣 13=头肩 14=下衣 15=鞋子 16=腰带 17=项链 18=手镯 19=戒指 20=辅助装备 21=魔法石)
var CEquipItem_GetItemType = new NativeFunction(ptr(0x08514D26), 'int', ['pointer'], {"abi":"sysv"});
//生成背包物品更新封包
var CInventory_MakeItemPacket = new NativeFunction(ptr(0x084FC6BC), 'int', ['pointer', 'int', 'int', 'pointer'], {"abi":"sysv"});
//给客户端发送指令错误包(防客户端假死)
var CUser_SendCmdErrorPacket = new NativeFunction(ptr(0x867BF42), 'int', ['pointer', 'int', 'int'], {"abi":"sysv"});

 //获取角色名字
var CUserCharacInfo_getCurCharacName = new NativeFunction(ptr(0x8101028), 'pointer', ['pointer'], {"abi":"sysv"});
//给角色发消息
var CUser_SendNotiPacketMessage = new NativeFunction(ptr(0x86886CE), 'int', ['pointer', 'pointer', 'int'], {"abi":"sysv"});
//获取角色上次退出游戏时间
var CUserCharacInfo_getCurCharacLastPlayTick = new NativeFunction(ptr(0x82A66AA), 'int', ['pointer'], {"abi":"sysv"});
//获取角色等级
var CUserCharacInfo_get_charac_level = new NativeFunction(ptr(0x80DA2B8), 'int', ['pointer'], {"abi":"sysv"});
//获取角色当前等级升级所需经验
var CUserCharacInfo_get_level_up_exp = new NativeFunction(ptr(0x0864E3BA), 'int', ['pointer', 'int'], {"abi":"sysv"});
//角色增加经验
var CUser_gain_exp_sp = new NativeFunction(ptr(0x866A3FE), 'int', ['pointer', 'int', 'pointer', 'pointer', 'int', 'int', 'int'], {"abi":"sysv"});
//发送道具
var CUser_AddItem = new NativeFunction(ptr(0x867B6D4), 'int', ['pointer', 'int', 'int', 'int', 'pointer', 'int'], {"abi":"sysv"});
//减少金币
var CInventory_use_money = new NativeFunction(ptr(0x84FF54C), 'int', ['pointer', 'int', 'int', 'int'], {"abi":"sysv"});
//增加金币
var CInventory_gain_money = new NativeFunction(ptr(0x84FF29C), 'int', ['pointer', 'int', 'int', 'int', 'int'], {"abi":"sysv"});

//获取角色当前持有金币数量
var CInventory_get_money = new NativeFunction(ptr(0x81347D6), 'int', ['pointer'], {"abi":"sysv"});

//通知客户端道具更新(客户端指针, 通知方式[仅客户端=1, 世界广播=0, 小队=2, war room=3], itemSpace[装备=0, 时装=1], 道具所在的背包槽)
var CUser_SendUpdateItemList = new NativeFunction(ptr(0x867C65A), 'int', ['pointer', 'int', 'int', 'int'], {"abi":"sysv"});

//获取系统时间
var CSystemTime_getCurSec = new NativeFunction(ptr(0x80CBC9E), 'int', ['pointer'], {"abi":"sysv"});
var GlobalData_s_systemTime_ = ptr(0x941F714);

var CInventory_getInvenRef = new NativeFunction(ptr(0x84FC1DE), 'pointer', ['pointer', 'int', 'int'], {"abi":"sysv"});

//检查背包中道具是否为空
var Inven_Item_isEmpty = new NativeFunction(ptr(0x811ED66), 'int', ['pointer'], {"abi":"sysv"});
//获取背包中道具item_id
var Inven_Item_getKey = new NativeFunction(ptr(0x850D14E), 'int', ['pointer'], {"abi":"sysv"});
//道具是否是装备
var Inven_Item_isEquipableItemType = new NativeFunction(ptr(0x08150812), 'int', ['pointer'], {"abi":"sysv"});
//获取装备pvf数据
var CDataManager_find_item = new NativeFunction(ptr(0x835FA32), 'pointer', ['pointer', 'int'], {"abi":"sysv"});
var CDataManager_get_level_exp =  new NativeFunction(ptr(0x08360442), 'int', ['pointer','int'], {"abi":"sysv"});
var CDataManager_getDailyTrainingQuest = new NativeFunction(ptr(0x083640fe), 'pointer', ['pointer','int'], {"abi":"sysv"});
var CDataManager_getSpAtLevelUp = new NativeFunction(ptr(0x08360cb8), 'int', ['pointer','int'], {"abi":"sysv"});
var CDataManager_get_event_script_mng = new NativeFunction(ptr(0x08110b62), 'pointer', ['pointer'], {"abi":"sysv"});
var CDataManager_getExpertJobScript = new NativeFunction(ptr(0x0822b5f2), 'pointer', ['pointer','int'], {"abi":"sysv"});
var CDataManager_get_dimensionInout = new NativeFunction(ptr(0x0822b612), 'int', ['pointer','int'], {"abi":"sysv"});

//是否魔法封印装备
var CEquipItem_IsRandomOption = new NativeFunction(ptr(0x8514E5E), 'int', ['pointer'], {"abi":"sysv"});
//解封魔法封印
var random_option_CRandomOptionItemHandle_give_option = new NativeFunction(ptr(0x85F2CC6),  'int', ['pointer', 'int', 'int', 'int', 'int', 'int', 'pointer'], {"abi":"sysv"});
//获取装备品级
var CItem_get_rarity = new NativeFunction(ptr(0x080F12D6), 'int', ['pointer'], {"abi":"sysv"});

//获取装备魔法封印等级
var CEquipItem_getRandomOptionGrade = new NativeFunction(ptr(0x8514E6E), 'int', ['pointer'], {"abi":"sysv"});

//本次登录时间
var CUserCharacInfo_getLoginTick = new NativeFunction(ptr(0x822F692),  'int', ['pointer'], {"abi":"sysv"});
//点券充值
var WongWork_IPG_CIPGHelper_IPGInput = new NativeFunction(ptr(0x80FFCA4),  'int', ['pointer', 'pointer', 'int', 'int', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer'], {"abi":"sysv"});

//代币充值
var WongWork_IPG_CIPGHelper_IPGInputPoint = new NativeFunction(ptr(0x80FFFC0),  'int', ['pointer', 'pointer','int', 'int', 'pointer', 'pointer'], {"abi":"sysv"});

//同步点券数据库
var WongWork_IPG_CIPGHelper_IPGQuery = new NativeFunction(ptr(0x8100790),  'int', ['pointer', 'pointer'], {"abi":"sysv"});

//重置异界/极限祭坛次数
var CUser_DimensionInoutUpdate = new NativeFunction(ptr(0x8656C12),  'int', ['pointer', 'int', 'int'], {"abi":"sysv"});
//设置幸运点数
var CUserCharacInfo_SetCurCharacLuckPoint = new NativeFunction(ptr(0x0864670A), 'int', ['pointer', 'int'], {"abi":"sysv"});
//获取角色当前幸运点
var CUserCharacInfo_GetCurCharacLuckPoint = new NativeFunction(ptr(0x822F828), 'int', ['pointer'], {"abi":"sysv"});
//设置角色属性改变脏标记(角色上线时把所有属性从数据库缓存到内存中, 只有设置了脏标记, 角色下线时才能正确存档到数据库, 否则变动的属性下线后可能会回档)
var CUserCharacInfo_enableSaveCharacStat = new NativeFunction(ptr(0x819A870), 'int', ['pointer'], {"abi":"sysv"});

var fsetCurCharacFatigue = new NativeFunction(ptr(0x0822F2CE), 'int', ['pointer', 'int16'], { "abi": "sysv" });

//获取角色点券余额
var CUser_getCera = new NativeFunction(ptr(0x080FDF7A), 'int', ['pointer'], {"abi":"sysv"});

//获取角色账号id
var CUser_get_acc_id = new NativeFunction(ptr(0x80DA36E), 'int', ['pointer'], {"abi":"sysv"});

//根据账号查找已登录角色
var GameWorld_find_user_from_world_byaccid = new NativeFunction(ptr(0x86C4D40), 'pointer', ['pointer', 'int'], {"abi":"sysv"});
//获取玩家任务信息
var CUser_getCurCharacQuestW = new NativeFunction(ptr(0x814AA5E),  'pointer', ['pointer'], {"abi":"sysv"});
//任务相关操作(第二个参数为协议编号: 33=接受任务, 34=放弃任务, 35=任务完成条件已满足, 36=提交任务领取奖励)
var CUser_quest_action = new NativeFunction(ptr(0x0866DA8A),  'int', ['pointer', 'int', 'int', 'int', 'int'], {"abi":"sysv"});
//发包给客户端
var CUser_Send = new NativeFunction(ptr(0x86485BA), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
//设置GM完成任务模式(无条件完成任务)
var CUser_setGmQuestFlag = new NativeFunction(ptr(0x822FC8E),  'int', ['pointer', 'int'], {"abi":"sysv"});
//是否GM任务模式
var CUser_getGmQuestFlag = new NativeFunction(ptr(0x822FC8E),  'int', ['pointer'], {"abi":"sysv"});
//通知客户端更新已完成任务列表
var CUser_send_clear_quest_list = new NativeFunction(ptr(0x868B044),  'int', ['pointer'], {"abi":"sysv"});
//计算任务基础奖励(不包含道具奖励)
var CUser_quest_basic_reward = new NativeFunction(ptr(0x866E7A8),  'int', ['pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'pointer', 'int'], {"abi":"sysv"});
//通知客户端QP更新
var CUser_sendCharacQp = new NativeFunction(ptr(0x868AC24),  'int', ['pointer'], {"abi":"sysv"});
//通知客户端QuestPiece更新
var CUser_sendCharacQuestPiece = new NativeFunction(ptr(0x868AF2C),  'int', ['pointer'], {"abi":"sysv"});
//获取角色状态
var CUser_get_state = new NativeFunction(ptr(0x80DA38C), 'int', ['pointer'], {"abi":"sysv"});
//通知客户端角色属性更新
var CUser_SendNotiPacket = new NativeFunction(ptr(0x867BA5C), 'int', ['pointer', 'int', 'int', 'int'], {"abi":"sysv"});

//获取DataManager实例
var G_CDataManager = new NativeFunction(ptr(0x80CC19B), 'pointer', [], {"abi":"sysv"});
//从pvf中获取任务数据
var CDataManager_find_quest = new NativeFunction(ptr(0x835FDC6), 'pointer', ['pointer', 'int'], {"abi":"sysv"});

var UserQuest_finish_quest = new NativeFunction(ptr(0x86AC854), 'int', ['pointer', 'int'], {"abi":"sysv"});
//通知客户端更新角色任务列表
var UserQuest_get_quest_info = new NativeFunction(ptr(0x86ABBA8), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
//重置所有任务为未完成状态
var UserQuest_reset = new NativeFunction(ptr(0x86AB894), 'int', ['pointer'], {"abi":"sysv"});

//设置任务为已完成状态
var WongWork_CQuestClear_setClearedQuest = new NativeFunction(ptr(0x808BA78), 'int', ['pointer', 'int'], {"abi":"sysv"});
//重置任务为未完成状态
var WongWork_CQuestClear_resetClearedQuests = new NativeFunction(ptr(0x808BAAC), 'int', ['pointer', 'int'], {"abi":"sysv"});
//任务是否已完成
var WongWork_CQuestClear_isClearedQuest = new NativeFunction(ptr(0x808BAE0), 'int', ['pointer', 'int'], {"abi":"sysv"});

//检测当前角色是否可接该任务
var stSelectQuestParam_stSelectQuestParam = new NativeFunction(ptr(0x83480B4), 'pointer', ['pointer', 'pointer'], {"abi":"sysv"});
var Quest_check_possible = new NativeFunction(ptr(0x8352D86), 'int', ['pointer', 'pointer'], {"abi":"sysv"});

//服务器组包
var PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DD4C), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_put_header = new NativeFunction(ptr(0x80CB8FC), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_put_byte = new NativeFunction(ptr(0x80CB920), 'int', ['pointer', 'uint8'], { "abi": "sysv" });
var InterfacePacketBuf_put_short = new NativeFunction(ptr(0x80D9EA4), 'int', ['pointer', 'uint16'], { "abi": "sysv" });
var InterfacePacketBuf_put_int = new NativeFunction(ptr(0x80CB93C), 'int', ['pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_put_binary = new NativeFunction(ptr(0x811DF08), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_finalize = new NativeFunction(ptr(0x80CB958), 'int', ['pointer', 'int'], { "abi": "sysv" });
var Destroy_PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DE80), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_clear =  new NativeFunction(ptr(0x080cb8e6), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_put_packet = new NativeFunction(ptr(0x0815098e), 'int', ['pointer','pointer'], { "abi": "sysv" });
var PacketGuard_free_PacketGuard = new NativeFunction(ptr(0x0858de80), 'void', ['pointer'], { "abi": "sysv" });
var Packet_Monitor_Max_Level_BroadCast_Packet_Monitor_Max_Level_BroadCast = new NativeFunction(ptr(0x08694560), 'void', ['pointer'], { "abi": "sysv" });

//服务器环境
var G_CEnvironment = new NativeFunction(ptr(0x080CC181), 'pointer', [], {"abi":"sysv"});
//获取当前服务器配置文件名
var CEnvironment_get_file_name = new NativeFunction(ptr(0x80DA39A), 'pointer', ['pointer'], {"abi":"sysv"});

//执行debug命令
var DoUserDefineCommand = new NativeFunction(ptr(0x0820ba90), 'int', ['pointer', 'int', 'pointer'], {"abi":"sysv"});

//linux读本地文件
var fopen = new NativeFunction(Module.getExportByName(null, 'fopen'), 'int', ['pointer', 'pointer'], {"abi":"sysv"});
var fread = new NativeFunction(Module.getExportByName(null, 'fread'), 'int', ['pointer', 'int', 'int', 'int'], {"abi":"sysv"});
var fclose = new NativeFunction(Module.getExportByName(null, 'fclose'), 'int', ['int'], {"abi":"sysv"});

// 获取账号金库
var CUser_getAccountCargo = new NativeFunction(ptr(0x822fc22), 'pointer', ['pointer'], {"abi":"sysv"});
// 获取账号金库一个空的格子
var CAccountCargo_getEmptySlot= new NativeFunction(ptr(0x828a580), 'int', ['pointer'], {"abi":"sysv"});
// 将已经物品移动到某个格子 第一个账号金库，第二个移入的物品，第三个格子位置
var CAccountCargo_InsertItem = new NativeFunction(ptr(0x8289c82), 'int', ['pointer','pointer','int'], {"abi":"sysv"});
// 向客户端发送账号金库列表
var CAccountCargo_SendItemList = new NativeFunction(ptr(0x828a88a), 'int', ['pointer'], {"abi":"sysv"});
//通知客户端QuestPiece更新
var GET_USER = new NativeFunction(ptr(0x084bb9cf),  'int', ['pointer'], {"abi":"sysv"});
//删除背包槽中的道具
var Inven_Item_reset = new NativeFunction(ptr(0x080CB7D8),  'int', ['pointer'], {"abi":"sysv"});
// 分解机 参数 角色 位置 背包类型  239  角色（谁的） 0xFFFF
var DisPatcher_DisJointItem_disjoint = new NativeFunction(ptr(0x81f92ca), 'int', ['pointer', 'int', 'int', 'int','pointer','int'], {"abi":"sysv"});
// 价差分解机用户的状态 参数 用户  239 背包类型 位置
var CUserCharacInfo_getCurCharacExpertJob = new NativeFunction(ptr(0x822f8d4), 'int', ['pointer'], {"abi":"sysv"});
//获取角色背包
var CUserCharacInfo_getCurCharacInvenW = new NativeFunction(ptr(0x80DA28E), 'pointer', ['pointer'], {"abi":"sysv"});

//获取道具名字
function api_CItem_getItemName(item_id)
{
    var citem = CDataManager_find_item(G_CDataManager(), item_id);
    if(!citem.isNull())
    {
        return ptr(CItem_getItemName(citem)).readUtf8String(-1);
    }

    return item_id.toString();
}

Interceptor.attach(ptr(0x080FC850),
{
	onEnter: function (args) 
	{
	this.equiPos = args[2].add(27).readU16();
	this.user = args[1];
	},
	onLeave: function (retval)
	{
	CUser_SendUpdateItemList(this.user, 1, 0, this.equiPos);
	}
});
	
function api_read_file(path, mode, len)
{
	var path_ptr = Memory.allocUtf8String(path);
	var mode_ptr = Memory.allocUtf8String(mode);
	var f = fopen(path_ptr, mode_ptr);

	if(f == 0)
		return null;

	var data = Memory.alloc(len);
	var fread_ret = fread(data, 1, len, f);

	fclose(f);

	//返回字符串
	if(mode == 'r')
		return data.readUtf8String(fread_ret);

	//返回二进制buff指针
	return data;
}


//写日志的路径
var logFilePath = null;
var directoryPath = '/dp2/frida_log/';
if (create_directory(directoryPath)) {
} else {
}

var originalConsoleLog = console.log;
console.log = function (msg) {
    writeToCustomLog(msg);
    originalConsoleLog(msg);
};

//获取当前频道名
function api_CEnvironment_get_file_name()
{
	var filename = CEnvironment_get_file_name(G_CEnvironment());
	return filename.readUtf8String(-1);
}

function createDirectory(path) {
    var dir = new File(path);
    if (!dir.isDirectory) {
        dir.mkdirs();
    }
}

function api_mkdir(path) {
    var mkdir = new NativeFunction(Module.getExportByName(null, 'mkdir'), 'int', ['pointer', 'int'], { "abi": "sysv" });
    var path_ptr = Memory.allocUtf8String(path);
    return mkdir(path_ptr, 0x1FF) === 0;
}

function getLocalTimestamp() {
    var date = new Date();
    date.setHours(date.getHours() + 8); // 转换到本地时间
    return date.toISOString();
}

function create_directory(path) {
    if (!logFilePath) {
        logFilePath = directoryPath + 'frida_' + api_CEnvironment_get_file_name() + '_' + getLocalTimestamp().split('T')[0] + '.log';
    }

    if (logFilePath) {
        try {
            var file = new File(logFilePath, 'a');
            file.write('[' + getLocalTimestamp() + '] ' + msg + '\n');
            file.flush();
            file.close();
        } catch (e) {
            // handle error
        }
    }

    var isCreated = api_mkdir(path);
    if (isCreated) {
        console.log('Directory created successfully: ' + path);
    } else {
        console.log('Failed to create directory: ' + path);
        console.log(logFilePath);
    }
    return isCreated;
}

function writeToCustomLog(msg) {
    var logFilePath = directoryPath + 'frida_' + api_CEnvironment_get_file_name() + '_' + getLocalTimestamp().split('T')[0] + '.log';
    var segmentation1 = getLocalTimestamp().split('T')[1]
    var segmentation2 = segmentation1.split('Z')[0]
    var segmentation3 = segmentation1.split('.')[0]
    try {
        var f = new File(logFilePath, "a");
        f.write('[' + segmentation3 + ']' + msg + '\n');
        f.flush();
        f.close();
    } catch (e) {
        originalConsoleLog('写入日志时出现错误：' + e.message);
    }
}

//生成随机整数(不包含max)
function get_random_int(min, max)
{
	return Math.floor(Math.random() * (max - min)) + min;
}

//内存十六进制打印
function bin2hex(p, len)
{
	var hex = '';
	for(var i = 0; i < len; i++)
	{
		var s = p.add(i).readU8().toString(16);
		if(s.length == 1)
			s = '0' + s;
		hex += s;
		if (i != len - 1)
			hex += ' ';
	}
	return hex;
}

//服务器组包
function api_PacketGuard_PacketGuard() 
{
    var packet_guard = Memory.alloc(0x20000);
    PacketGuard_PacketGuard(packet_guard);

    return packet_guard;
}

//点券充值 (禁止直接修改billing库所有表字段, 点券相关操作务必调用数据库存储过程!)
function api_recharge_cash_cera(user, amount)
{
	//充值
	WongWork_IPG_CIPGHelper_IPGInput(ptr(0x941F734).readPointer(), user, 5, amount, ptr(0x8C7FA20), ptr(0x8C7FA20),
		Memory.allocUtf8String('GM'), ptr(0), ptr(0), ptr(0));

	//通知客户端充值结果
	WongWork_IPG_CIPGHelper_IPGQuery(ptr(0x941F734).readPointer(), user);
}

//代币充值 (禁止直接修改billing库所有表字段, 点券相关操作务必调用数据库存储过程!)
function api_recharge_cash_cera_point(user, amount)
{
	//充值
	WongWork_IPG_CIPGHelper_IPGInputPoint(ptr(0x941F734).readPointer(), user, amount, 4, ptr(0), ptr(0));

	//通知客户端充值结果
	WongWork_IPG_CIPGHelper_IPGQuery(ptr(0x941F734).readPointer(), user);
}

function PcroomResponse_IsShutdonTimeOverLogin()
{
	Inter_PcroomResponse_IsShutdonTimeOverLogin = new NativeFunction(ptr(0x84DB40E), 'pointer', [], {"abi":"sysv"});
	Inter_PcroomResponse_IsShutdonTimeOverLogin();
	console.log('Inter_PcroomResponse_IsShutdonTimeOverLogin');
}

//warstart 
function WarRoom_Start()
{
	var Inter_WarRoom_Start = new NativeFunction(ptr(0x86BD6D4),'pointer',['pointer'], {"abi":"sysv"});
	Inter_WarRoom_Start(ptr(0));
}

//Warjoin
function Warroom_join()
{
	var Inte_WarRoom_Join = new NativeFunction(ptr(0x86BAE9A),'pointer',['pointer','pointer','int'], {"abi":"sysv"});
	Inter_WarRoom_Join(ptr(0),user,0);
}

//PCroom
function Pcroom(user)
{
	var Inter_PcroomResponse_dispatch_sig =  new NativeFunction(ptr(0x84DB452), 'pointer', ['pointer' ,'pointer' ,'pointer'], {"abi":"sysv"});
	var a3 =Memory.alloc(100);
	a3.add(18).writeInt(7);//
	a3.add(22).writeInt(0);//
	Inter_PcroomResponse(ptr(0),user,a3);
}

function CUser_setPcRoomAuth(user)
{
	Inter_CUser_setPcRoomAuth = new NativeFunction(ptr(0x84EC834),'pointer',['pointer' ,'pointer'], {"abi":"sysv"});
	Inter_CUser_setPcRoomAuth(user,1)
	console.log('====================================ok')
}

function Inter_OnTimeEventRewardStart(user)
{
	var Inter_OnTimeEventRewardStart_dispatch_sig = new NativeFunction(ptr(0x84E0DC6), 'pointer', ['pointer' ,'pointer' ,'pointer'], {"abi":"sysv"});
	var a3 =Memory.alloc(100);
	a3.add(10).writeInt(0);//
	a3.add(18).writeInt(100);//
	a3.add(22).writeInt(100);//
	a3.add(14).writeInt(100);//
	Inter_OnTimeEventRewardStart_dispatch_sig(ptr(0),user,a3);
	console.log('Inter_OnTimeEventRewardStart-------------------------OK');
}

//获取系统UTC时间(秒)
function api_CSystemTime_getCurSec()
{
	return GlobalData_s_systemTime_.readInt();
}

//给角色发经验
function api_CUser_gain_exp_sp(user, exp)
{
	var a2 = Memory.alloc(4);
	var a3 = Memory.alloc(4);
	CUser_gain_exp_sp(user, exp, a2, a3, 0, 0, 0);
}

//给角色发道具
function api_CUser_AddItem(user, item_id, item_cnt)
{
	var item_space = Memory.alloc(4);
	var slot = CUser_AddItem(user, item_id, item_cnt, 6, item_space, 0);

	if(slot >= 0)
	{
		CUser_SendUpdateItemList(user, 1, item_space.readInt(), slot);
	}
	return;
}

function api_CUserCharacInfo_getCurCharacName(user)
{
	var p = CUserCharacInfo_getCurCharacName(user);
	if(p.isNull())
	{
		return '';
	}
	return p.readUtf8String(-1);
}

//给角色发消息
function api_CUser_SendNotiPacketMessage(user, msg, msg_type)
{
	var p = Memory.allocUtf8String(msg);
	CUser_SendNotiPacketMessage(user, p, msg_type);
	return;
}

//从客户端封包中读取数据(失败会抛异常, 调用方必须做异常处理)
function api_PacketBuf_get_byte(packet_buf)
{
	var data = Memory.alloc(1);

	if(PacketBuf_get_byte(packet_buf, data))
	{
		return data.readU8();
	}

	throw  new Error('PacketBuf_get_byte Fail!');
}

function api_PacketBuf_get_short(packet_buf)
{
	var data = Memory.alloc(2);

	if(PacketBuf_get_short(packet_buf, data))
	{
		return data.readShort();
	}

	throw  new Error('PacketBuf_get_short Fail!');
}

function api_PacketBuf_get_int(packet_buf)
{
	var data = Memory.alloc(4);

	if(PacketBuf_get_int(packet_buf, data))
	{
		return data.readInt();	
	}


	throw  new Error('PacketBuf_get_int Fail!');
}

function api_PacketBuf_get_binary(packet_buf, len)
{
	var data = Memory.alloc(len);

	if(PacketBuf_get_binary(packet_buf, data, len))
	{
		return data.readByteArray(len);
	}

	throw  new Error('PacketBuf_get_binary Fail!');
}

//获取原始封包数据
function api_PacketBuf_get_buf(packet_buf)
{
	return packet_buf.add(20).readPointer().add(13);
}

//hookCUser::DisConnSig
function CUser_is_ConnSig()
{
		
	Interceptor.attach(ptr(0x86489F4), 
	{
	
		onEnter: function (args) 
		{
			console.log("CUserisConnSig--------------------------state:"+args[0],args[1],args[2],args[3]);
			var cu =args[0]
		},
		onLeave: function (retval) 
		{
		}
	});
}

//调用Encrypt解密函数
var decrypt = new NativeFunction(ptr(0x848DB5E), 'pointer', ['pointer', 'pointer', 'pointer'], {"abi":"sysv"});

//拦截Encryption::Encrypt
function hook_encrypt()
{
	Interceptor.attach(ptr(0x848DA70), 
	{
	
		onEnter: function (args) 
		{
			console.log("Encrypt:"+args[0],args[1],args[2]);
		},
		onLeave: function (retval) 
		{
		}
	});
}

//拦截Encryption::decrypt
function hookdecrypt()
{
	Interceptor.attach(ptr(0x848DB5E), 
	{
	
		onEnter: function (args) 
		{
			console.log("decrypt:"+args[0],args[1],args[2]);
		},
		onLeave: function (retval) 
		{
		}
	});
}

//拦截encrypt_packet
function hookencrypt_packet ()
{
	Interceptor.attach(ptr(0x858D86A), 
	{

		onEnter: function (args) 
		{
			console.log("encrypt_packet:"+args[0]);
		},
		onLeave: function (retval) 
		{
		}
	});
}

//拦截DisPatcher_Login
function DisPatcher_Login()
{

	Interceptor.attach(ptr(0x81E8C78), 
	{
	onEnter: function (args)
	{
		console.log('DisPatcher_Login:' + args[0] , args[1] , args[2] , args[3] , args[4] );
		},
		onLeave: function (retval) 
		{
		}
	});
}

//拦截DisPatcher_ResPeer::dispatch_sig
function DisPatcher_ResPeer_dispatch_sig()
{

	Interceptor.attach(ptr(0x81F088E), 
	{
	onEnter: function (args) 
	{
		console.log('DisPatcher_ResPeer_dispatch_sig:' + args[0] , args[1] , args[2] , args[3] );
		},
		onLeave: function (retval)
		{
		}
	});
}

//拦截PacketDispatcher::doDispatch
function PacketDispatcher_doDispatch()
{

	Interceptor.attach(ptr(0x8594922),
	{

	onEnter: function (args) 
	{
		console.log('PacketDispatcher_doDispatch:' + args[0] , args[1] , args[2] , args[3] , args[4] , args[5] , args[6] , args[7]);
		var a1 = args[0].readInt();
		console.log(a1);
		var a2 = args[1].readInt();
		console.log(a2);
		var a5 = args[4].readUtf16String(-1);
		console.log(a5);
		},
		onLeave: function (retval)
		{
		}
	});
}

//拦截PacketDispatcher::PacketDispatcher
function PacketDispatcher_PacketDispatcher()
{
	Interceptor.attach(ptr(0x8590A2E), 
	{
	onEnter: function (args) 
	{
		console.log('PacketDispatcher_PacketDispatcher:' + args[0] );
		var a1 = args[0].readInt();
		},
		onLeave: function (retval)
		{
		}
	});
}

//拦截CUser::SendCmdOkPacket
function CUser_SendCmdOkPacket()
{
	Interceptor.attach(ptr(0x867BEA0), 
	{
	onEnter: function (args) 
	{
		console.log('CUser_SendCmdOkPacket:' + args[0] + args[1]);
		var a2 = args[0].readInt();
		console.log("CUser_SendCmdOkPacket:"+a2);
		},
		onLeave: function (retval) 
		{
		}
	});
}

//世界广播(频道内公告)
function api_gameWorld_SendNotiPacketMessage(msg, msg_type)
{
	var packet_guard = api_PacketGuard_PacketGuard();
	InterfacePacketBuf_put_header(packet_guard, 0, 12);
	InterfacePacketBuf_put_byte(packet_guard, msg_type);
	InterfacePacketBuf_put_short(packet_guard, 0);
	InterfacePacketBuf_put_byte(packet_guard, 0);
	api_InterfacePacketBuf_put_string(packet_guard, msg);
	InterfacePacketBuf_finalize(packet_guard, 1);
	GameWorld_send_all_with_state(G_gameWorld(), packet_guard, 3);  //只给state >= 3 的玩家发公告
	Destroy_PacketGuard_PacketGuard(packet_guard);
//0为上方系统公告栏
//1为下方对话框/绿色
//2为下方对话框/蓝色
//3为下方对话框/白色
//5为下方对话框/白色
//6为下方对话框/紫色
//7为下方对话框/绿色
//8为下方对话框/橙色
//9为下方对话框/蓝色
//10为喇叭，但是会乱码
//11为喇叭
//12为喇叭
//13为喇叭
//14为喇叭
}

//发送字符串给客户端
function api_InterfacePacketBuf_put_string(packet_guard, s)
{
	var p = Memory.allocUtf8String(s);
	var len = strlen(p);
	InterfacePacketBuf_put_int(packet_guard, len);
	InterfacePacketBuf_put_binary(packet_guard, p, len);
	return;
}

//幸运点上下限
var MAX_LUCK_POINT = 99999;
var MIN_LUCK_POINT = 1;

//设置角色幸运点
function api_CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point) {
	if (new_luck_point > MAX_LUCK_POINT)
		new_luck_point = MAX_LUCK_POINT;
	else if (new_luck_point < MIN_LUCK_POINT)
		new_luck_point = MIN_LUCK_POINT;
	CUserCharacInfo_enableSaveCharacStat(user);
	CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point);
	return new_luck_point;
}

//幸运值查询
function Query_lucky_points(user) {

	//设置变量
	var new_luck_point = null;
	
	//当前幸运点数
	new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(user));

	new_luck_point = api_CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point);
	//通知客户端当前角色幸运点已改变
	api_CUser_SendNotiPacketMessage(user, '当前幸运点数: ' + new_luck_point, 0);
}

//幸运值升满，1-3全黄
function Max_Lucky_Points(user) {

	//设置变量
	var new_luck_point = null;
	
	//当前幸运点数
	new_luck_point = MAX_LUCK_POINT;

	//修改角色幸运点
	new_luck_point = api_CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point);
	
	//通知客户端当前角色幸运点已改变
	api_CUser_SendNotiPacketMessage(user, '深渊精灵对你加持了超级祝福，仅本次副本有效', 37);
}

//幸运值最低
function Min_Lucky_Points(user) {

	//设置变量
	var new_luck_point = null;
	
	//当前幸运点数
	new_luck_point = MIN_LUCK_POINT;

	//修改角色幸运点
	new_luck_point = api_CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point);
	
	//通知客户端当前角色幸运点已改变
	api_CUser_SendNotiPacketMessage(user, '深渊精灵对你加持了超级诅咒，仅本次副本有效', 37);
}

//使用命运硬币后, 可以改变自身幸运点
function use_ftcoin_change_luck_point(user) {
	//抛命运硬币
	var rand = get_random_int(0, 100);

	//当前幸运点数
	var new_luck_point = null;

	if (rand == 100) 
		{
		//如果rand等于100则玩家幸运点拉满
		new_luck_point = MAX_LUCK_POINT;
		}
	else if (rand > 75) 
		{
		//如果rand大于0则当前幸运点增加5000
		new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(user) + 5000);
		}
	else if (rand > 50) 
		{
		//如果rand大于0则当前幸运点增加20%
		new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(user) - 5000);
		}
	else if (rand > 25) 
		{
		//如果rand大于0则当前幸运点减少5000
		new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(user) * 1.2);
	    }
	else if (rand > 0) 
		{
		//如果rand大于0则当前幸运点减少20%
		new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(user) * 0.8);
	    }
	if (rand == 0) 
		{
		//如果rand等于0则玩家幸运点清空
		new_luck_point = MIN_LUCK_POINT;
		}
	//修改角色幸运点
	new_luck_point = api_CUserCharacInfo_SetCurCharacLuckPoint(user, new_luck_point);
	//通知客户端当前角色幸运点已改变
	api_CUser_SendNotiPacketMessage(user, '命运已被改变, 当前幸运点数: ' + new_luck_point, 0);
}

//使用角色幸运值加成装备爆率
function enable_drop_use_luck_piont() {
	//由于roll点爆装函数拿不到user, 在杀怪和翻牌函数入口保存当前正在处理的user
	var cur_luck_user = null;
	//DisPatcher_DieMob::dispatch_sig
	Interceptor.attach(ptr(0x81EB0C4),
		{
			onEnter: function (args) {
				cur_luck_user = args[1];
			},
			onLeave: function (retval) {
				cur_luck_user = null;
			}
		});

	//CParty::SetPlayResult
	Interceptor.attach(ptr(0x85B2412),
		{
			onEnter: function (args) {
				cur_luck_user = args[1];
			},
			onLeave: function (retval) {
				cur_luck_user = null;
			}
		});
	//修改决定出货品质(rarity)的函数 使出货率享受角色幸运值加成
	//CLuckPoint::GetItemRarity
	var CLuckPoint_GetItemRarity_ptr = ptr(0x8550BE4);
	var CLuckPoint_GetItemRarity = new NativeFunction(CLuckPoint_GetItemRarity_ptr, 'int', ['pointer', 'pointer', 'int', 'int'], { "abi": "sysv" });
	Interceptor.replace(CLuckPoint_GetItemRarity_ptr, new NativeCallback(function (a1, a2, roll, a4) {
		//使用角色幸运值roll点代替纯随机roll点
		if (cur_luck_user) {
			//获取当前角色幸运值
			var luck_point = CUserCharacInfo_GetCurCharacLuckPoint(cur_luck_user);

			//roll点范围1-100W, roll点越大, 出货率越高
			//角色幸运值范围1-10W
			//使用角色 [当前幸运值*10] 作为roll点下限, 幸运值越高, roll点越大
			roll = get_random_int(luck_point * 10, 1000000);
		}
		//执行原始计算爆装品质函数
		var rarity = CLuckPoint_GetItemRarity(a1, a2, roll, a4);
		//调整角色幸运值
		if (cur_luck_user) {
			var rate = 1.0;

			//出货粉装以上, 降低角色幸运值
			if (rarity >= 3) {
				//出货品质越高, 幸运值下降约快
				rate = 1 - (rarity * 0.01);
			}
			else {
				//未出货时, 提升幸运值
				rate = 1.01;
			}
			//设置新的幸运值
			var new_luck_point = Math.floor(CUserCharacInfo_GetCurCharacLuckPoint(cur_luck_user) * rate);
			api_CUserCharacInfo_SetCurCharacLuckPoint(cur_luck_user, new_luck_point);
		}
		return rarity;
	}, 'int', ['pointer', 'pointer', 'int', 'int']));
}

//无条件完成指定任务并领取奖励
function api_force_clear_quest(user, quest_id) {
	//设置GM完成任务模式(无条件完成任务)
	CUser_setGmQuestFlag(user, 1);
	//接受任务
	CUser_quest_action(user, 33, quest_id, 0, 0);
	//完成任务
	CUser_quest_action(user, 35, quest_id, 0, 0);
	//领取任务奖励(倒数第二个参数表示领取奖励的编号, -1=领取不需要选择的奖励; 0=领取可选奖励中的第1个奖励; 1=领取可选奖励中的第二个奖励)
	CUser_quest_action(user, 36, quest_id, -1, 1);

	//服务端有反作弊机制: 任务完成时间间隔不能小于1秒.  这里将上次任务完成时间清零 可以连续提交任务
	user.add(0x79644).writeInt(0);

	//关闭GM完成任务模式(不需要材料直接完成)
	CUser_setGmQuestFlag(user, 0);
	return;
}

// 完成指定任务并领取奖励
function clear_doing_questEx(user, quest_ids) {
	//玩家任务信息
	var user_quest = CUser_getCurCharacQuestW(user);
    // 玩家已完成任务信息
    var WongWork_CQuestClear = CUser_getCurCharacQuestW(user).add(4);
    // pvf数据
    var data_manager = G_CDataManager();
    
    // 循环处理任务序号数组
    for (var i = 0; i < quest_ids.length; i++) {
        var quest_id = quest_ids[i];
        // 跳过已完成的任务
        if (!WongWork_CQuestClear_isClearedQuest(WongWork_CQuestClear, quest_id)) {
            // 获取pvf任务数据
            var quest = CDataManager_find_quest(data_manager, quest_id);
            if (!quest.isNull()) {
                // 无条件完成指定任务并领取奖励
			api_force_clear_quest(user, quest_id);
			//通知客户端更新已完成任务列表
			CUser_send_clear_quest_list(user);
			//通知客户端更新任务列表
			var packet_guard = api_PacketGuard_PacketGuard();
			UserQuest_get_quest_info(user_quest, packet_guard);
			CUser_Send(user, packet_guard);
			Destroy_PacketGuard_PacketGuard(packet_guard);
            }
        } else {
            // 公告通知客户端本次自动完成任务数据
            api_CUser_SendNotiPacketMessage(user, '指定任务已完成', 8);
        }
    }
}
/////------------------------------------------------------------------------------------------------------------------------------------------


var db_name = "taiwan_cain";
var db_ip = "127.0.0.1";
var db_port = 3306;
var db_account = "game";
var db_password = "uu5!^%jg";
var mysql = api_MYSQL_open(db_name, db_ip, db_port, db_account, db_password);

// 初始化数据库(打开数据库/建库建表/数据库字段扩展)
function init_db()
{
// 打开数据库连接
if (mysql_taiwan_cain == null)
{
    mysql_taiwan_cain = api_MYSQL_open(db_name, db_ip, db_port, db_account, db_password);
}
if (mysql_d_taiwan == null)
{
    mysql_d_taiwan = api_MYSQL_open('d_taiwan', db_ip, db_port, db_account, db_password);
}
if (mysql_taiwan_cain_2nd == null)
{
    mysql_taiwan_cain_2nd = api_MYSQL_open('taiwan_cain_2nd', db_ip, db_port, db_account, db_password);
}
if (mysql_taiwan_billing == null)
{
    mysql_taiwan_billing = api_MYSQL_open('taiwan_billing', db_ip, db_port, db_account, db_password);
}
if (mysql_d_guild == null)
{
    mysql_d_guild = api_MYSQL_open('d_guild', db_ip, db_port, db_account, db_password);
}
// 装备镶嵌数据库(存放装备打孔/徽章数据)
api_MySQL_exec(mysql_taiwan_cain, 'create database if not exists myequ_jewel default charset utf8;');
if (mysql_frida == null)
{
    mysql_frida = api_MYSQL_open('myequ_jewel', db_ip, db_port, db_account, db_password);
}
api_MySQL_exec(mysql_frida, 'CREATE TABLE if not exists data (\
    equ_id int(11) AUTO_INCREMENT, jewel_data blob NOT NULL,andonglishanbai_flag int(11),date datetime,\
    PRIMARY KEY  (equ_id)\
) ENGINE=InnoDB DEFAULT CHARSET=utf8,AUTO_INCREMENT = 150;');//创建数据库，排序从150开始，也可以从大一点的数值开始
}	
	
function api_MYSQL_open(db_name, db_ip, db_port, db_account, db_password)
{
	//mysql初始化
	var mysql = Memory.alloc(0x80000);
	MySQL_MySQL(mysql);
	MySQL_init(mysql);
	
	//连接数据库
	var db_ip_ptr = Memory.allocUtf8String(db_ip);
	var db_port = db_port;
	var db_name_ptr = Memory.allocUtf8String(db_name);
	var db_account_ptr = Memory.allocUtf8String(db_account);
	var db_password_ptr = Memory.allocUtf8String(db_password);
	var ret = MySQL_open(mysql, db_ip_ptr, db_port, db_name_ptr, db_account_ptr, db_password_ptr);
	if(ret)
	{
		return mysql;
	}
	return null;
}

//已打开的数据库句柄
var mysql_taiwan_cain = null;
var mysql_d_taiwan = null;
var mysql_taiwan_cain_2nd = null;
var mysql_taiwan_billing = null;
var mysql_d_guild = null;
//装备镶嵌数据库句柄
var mysql_frida = null;

//关闭数据库
function uninit_db()
{
	if(mysql_taiwan_cain)
	{
		MySQL_close(mysql_taiwan_cain);
		mysql_taiwan_cain = null;
	}
	if(mysql_d_taiwan)
	{
		MySQL_close(mysql_d_taiwan);
		mysql_d_taiwan = null;
	}
	if(mysql_taiwan_cain_2nd)
	{
		MySQL_close(mysql_taiwan_cain_2nd);
		mysql_taiwan_cain_2nd = null;
	}
	
	if(mysql_taiwan_billing)
	{
		MySQL_close(mysql_taiwan_billing);
		mysql_taiwan_billing = null;
	}
	if(mysql_d_guild)
	{
		MySQL_close(mysql_d_guild);
		mysql_d_guild = null;
	}
	if(mysql_frida)
	{
		MySQL_close(mysql_frida);
		mysql_frida = null;
	}
}
	
//mysql查询(返回mysql句柄)(注意线程安全)
function api_MySQL_exec(mysql, sql)
{
	var sql_ptr = Memory.allocUtf8String(sql);
	MySQL_set_query_2(mysql, sql_ptr);
	return MySQL_exec(mysql, 1);
}

//查询sql结果
//使用前务必保证api_MySQL_exec返回0
//并且MySQL_get_n_rows与预期一致
function api_MySQL_get_int(mysql, field_index)
{
	var v = Memory.alloc(4);
	if(1 == MySQL_get_int(mysql, field_index, v))
		return v.readInt();
	console.log('api_MySQL_get_int Fail!!!');
	return null;
}
function api_MySQL_get_uint(mysql, field_index)
{
	var v = Memory.alloc(4);
	if(1 == MySQL_get_uint(mysql, field_index, v))
		return v.readUInt();
	console.log('api_MySQL_get_uint Fail!!!');
	return null;
}
function api_MySQL_get_short(mysql, field_index)
{
	var v = Memory.alloc(4);
	if(1 == MySQL_get_short(mysql, field_index, v))
		return v.readShort();
	console.log('MySQL_get_short Fail!!!');
	return null;
}
function api_MySQL_get_float(mysql, field_index)
{
	var v = Memory.alloc(4);
	if(1 == MySQL_get_float(mysql, field_index, v))
		return v.readFloat();
	console.log('MySQL_get_float Fail!!!');
	return null;
}
function api_MySQL_get_str(mysql, field_index)
{
    var binary_length = MySQL_get_binary_length(mysql, field_index);
    if(binary_length > 0)
    {
        var v = Memory.alloc(binary_length);
        if(1 == MySQL_get_binary(mysql, field_index, v, binary_length))
            return v.readUtf8String(binary_length);
    }
    console.log('MySQL_get_str Fail!!!');
    return null;
}

function api_MySQL_get_binary(mysql, field_index)
{
	var binary_length = MySQL_get_binary_length(mysql, field_index);
	if(binary_length > 0)
	{
		var v = Memory.alloc(binary_length);
		if(1 == MySQL_get_binary(mysql, field_index, v, binary_length))
			return v.readByteArray(binary_length);
	}
	console.log('api_MySQL_get_binary Fail!!!');
	return null;
}

/////------------------------------------------------------------------------------------------------------------------------------------------
var firstSecondsValueStorage = null;
var First_kill = null;
var dungeonTimeRecords = {};
var seconds;

function timeToSeconds(timeString) {
var hours = parseInt(timeString.substring(0, 2));
var minutes = parseInt(timeString.substring(2, 4));
var seconds = parseInt(timeString.substring(4, 6));
var totalSeconds = hours * 3600 + minutes * 60 + seconds;
return totalSeconds;
}

function saveFirstSecondsValue(charac_no, seconds) 
{
    firstSecondsValueStorage = seconds;
}

function getSavedFirstSecondsValue(charac_no) 
{
    return firstSecondsValueStorage;
}

function clearSavedFirstSecondsValue(charac_no) 
{
    firstSecondsValueStorage = null;
}

//返回选择角色界面
var CUser_ReturnToSelectCharacList = new NativeFunction(ptr(0x8686FEE), 'int', ['pointer', 'int'], {"abi":"sysv"});

//返回选择角色界面CUser_ReturnToSelectCharacList
function api_CUser_ReturnToSelectCharacList(user)
{
	api_scheduleOnMainThread(CUser_ReturnToSelectCharacList, [user, 1]);
}

var CUser_getCurCharacQuestR= new NativeFunction(ptr(0x0819a8a6),  'pointer', ['pointer'], {"abi":"sysv"});
var WongWork_CQuestClear_isClearedQuest = new NativeFunction(ptr(0x808BAE0), 'int', ['pointer', 'int'], {"abi":"sysv"});

var CUserCharacInfo_setDemensionInoutValue = new NativeFunction(ptr(0x0822f184), 'int', ['pointer','int','int'], {"abi":"sysv"});

function resetResetDimensionInout(user, index)
{
	var dimensionInout = CDataManager_get_dimensionInout(G_CDataManager(), index);
	CUserCharacInfo_setDemensionInoutValue(user, index, dimensionInout);
}

var CInventory_SendItemLockListInven = new NativeFunction(ptr(0x84FAF8E), 'void', ['pointer'], {"abi": "sysv"});

var CUserCharacInfo_get_charac_job = new NativeFunction(ptr(0x080fdf20), 'int', ['pointer'], {"abi":"sysv"});//职业id
var CUserCharacInfo_get_pvp_grade =  new NativeFunction(ptr(0x0819ee4a), 'int', ['pointer'], {"abi":"sysv"});//pk等级
var CUserCharacInfo_setCurCharacFatigue = new NativeFunction(ptr(0x0822f2ce), 'int', ['pointer','int'], {"abi":"sysv"});
var CUserCharacInfo_getCurCharacFatigue = new NativeFunction(ptr(0x0822f2ae), 'int', ['pointer'], {"abi":"sysv"});
var CUser_getCurCharacTotalFatigue = new NativeFunction(ptr(0x08657766), 'int', ['pointer'], {"abi":"sysv"});

var CUser_RecoverFatigue =new NativeFunction(ptr(0x08657ada), 'int', ['pointer','int'], {"abi":"sysv"});
var CUser_SendFatigue =new NativeFunction(ptr(0x08656540), 'void', ['pointer'], {"abi":"sysv"});

var CUserCharacInfo_getCurCharacSkillR = new NativeFunction(ptr(0x0822f130), 'pointer', ['pointer'], {"abi": "sysv"});
var CUser_send_skill_info = new NativeFunction(ptr(0x0866C46A), 'void', ['pointer'], {"abi": "sysv"});

//强制退出副本
var CParty_ReturnToVillage = new NativeFunction(ptr(0X85ACA60), 'void', ['int','pointer'], { "abi": "sysv" });

//检查背包中是否存在item
var CInventory_check_item_exist = new NativeFunction(ptr(0x08505172), 'int', ['pointer', 'int'], {"abi":"sysv"});

var CInventory_getInvenData = new NativeFunction(ptr(0x084fbf2c), 'int', ['pointer', 'int', 'pointer'], {"abi": "sysv"});

var CItem_getPrice = new NativeFunction(ptr(0x822c84a), 'int', ['pointer'], {"abi":"sysv"});


var jl_reward = 0;	
var	number = 0;	
var identification = '玩家[';
var dgnname = {};
function hook_history_log()
{
    Interceptor.attach(ptr(0x854F990), 
	{
        onEnter: function (args) 
		{
            var history_log = args[1].readUtf8String(-1);
            var group = history_log.split(',');
			var rewardAmount = 1;
            var account_id = parseInt(group[1]);
			var time_hh_mm_ss = group[3];
            var charac_name = group[4];
            var charac_no = group[5];
            var charac_level = group[6];
            var charac_job = group[7];
            var charac_growtype = group[8];
            var user_web_address = group[9];
            var user_peer_ip2 = group[10];
            var user_port = group[11];
            var channel_index = group[12];
            var game_event = group[13].slice(1);
			var Dungeon_nameget = group[14];
			var item_id = parseInt(group[15]);
			var reason = parseInt(group[18]);
			var mob_boss = group[22];
			var mob_id = group[14];
			var Dungeon_name = Dungeon_nameget;
			var Item_Total_number = group[16];
			var Item_number = group[17];
			var Item_mode = group[18];
			var mail_number = group[19];
            var user = GameWorld_find_user_from_world_byaccid(G_gameWorld(), account_id);
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
				if (game_event == 'KillMob') 
				{ 
					if (mob_id == 1) //如果怪物代码等于1
						{
							if (First_kill == null) //如果这个怪物还未其他人被击杀过
								{
								jl_reward = 3038 //黑色大晶体
								number = 1 //1个
								//api_gameWorld_SendNotiPacketMessage('哥布林:只会虐菜,你死得了!', 1)
								//sendRewardsByWindow(user, [jl_reward, number]);//发放道具奖励黑色大晶体1个
								//First_kill = {}//置空，证明该怪物已被首杀//每次保存此脚本会还原成未被击杀状态
								}
							if (group[24] == 0 && group[25] == 0 && group[26] == 0 && group[27] == 0) 
								{
									if (group[15] == 0 && group[16] == 0 && group[18] == 0) 
									{
										if (group[20] == 0 && group[21] == 0 && group[22] == 0) 
										{
											api_CUser_SendNotiPacketMessage(user,'--------------!!!警告!!!--------------\nKill数据异常，日志已记录，请自觉规范游戏', 37);
											console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']刷图数据异常');
											api_CUser_ReturnToSelectCharacList(user);
										}
									}
								}
						}
					if (mob_boss == 3) 
						{
						seconds = timeToSeconds(time_hh_mm_ss) - dungeonTimeRecords[charac_no];
						saveFirstSecondsValue(charac_no, seconds); // 保存通关时间
						}
				}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
			else if (game_event == 'DungeonEnter') //进入副本
				{
				dungeonTimeRecords[charac_no] = timeToSeconds(time_hh_mm_ss); // 记录角色进入副本时间
				var charac_no = CUserCharacInfo_getCurCharacNo(user);
				dgnname[charac_no] = group[14];//记录进入副本名字
				//Query_lucky_points(user); // 幸运点数值显示
				}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
			else if (game_event == 'DungeonClearInfo') //死亡离开副本
				{
				//死亡状态退出副本时执行的操作
				}
			else if (game_event == 'DungeonLeave') //离开副本
				{
				console.log(savedFirstSecondsValue)
				var savedFirstSecondsValue = getSavedFirstSecondsValue(charac_no);
				var seconds = timeToSeconds(time_hh_mm_ss) - dungeonTimeRecords[charac_no];

				if (savedFirstSecondsValue > 0) //如果通关时间判定大于0
					{
						if (savedFirstSecondsValue < 5) //如果副本通关时间小于5秒则踢出游戏
							{
							api_CUser_SendNotiPacketMessage(user,'--------------!!!警告!!!--------------\n副本数据异常，日志已记录，请自觉规范游戏', 37);
							api_gameWorld_SendNotiPacketMessage(identification + api_CUserCharacInfo_getCurCharacName(user) + ']' + '在副本' + Dungeon_name + '中数据异常\n已被强制下线，请各位自觉规范游戏 ', 14);
							api_CUser_ReturnToSelectCharacList(user);
							}
						else if (savedFirstSecondsValue < 1200) //如果副本通关时间小于1200秒通关则播报
							{
							api_gameWorld_SendNotiPacketMessage(identification + api_CUserCharacInfo_getCurCharacName(user) + ']' + '通关' + Dungeon_name + '用时 ' + parseInt((savedFirstSecondsValue / 60)) + '分' + (savedFirstSecondsValue % 60) + '秒', 14);
							console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']' + '通关' + Dungeon_name + '用时 ' + parseInt((savedFirstSecondsValue / 60)) + ' 分 ' + (savedFirstSecondsValue % 60) + ' 秒');
							clearSavedFirstSecondsValue(charac_no);
							}
					}
				else 
					{
						if (seconds < 30) //如果进副本时间小于30秒退出则播报
							{
							api_gameWorld_SendNotiPacketMessage(identification + api_CUserCharacInfo_getCurCharacName(user) + ']' + '放弃副本' + Dungeon_name + '用时 ' + parseInt((seconds / 60)) + '分' + (seconds % 60) + '秒', 14);
							}
					}
				}	
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
			else if (game_event == 'MailS') //邮件发送
				{
				var item_id = parseInt(group[18]);
				var js_name = group[14];
				var Number_of_emails = group[19];
				console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']发送邮件[' + api_CItem_getItemName(item_id) + '] ' + Number_of_emails + ' 个,到角色[' + js_name + ']');
				}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
			else if(game_event == 'Item-')	
{
			var itemData = CDataManager_find_item(G_CDataManager(), item_id);
			var needLevel = CItem_getUsableLevel(itemData);
			var inEquRarity = CItem_getRarity(itemData);
				if(Item_Total_number == Item_number)//使用道具
					{
						if(Item_mode == 5)//城镇内
							{
							console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']城镇内使用[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<0>个')
							}	
					else if(Item_mode == 6)//副本内
						{
						console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']副本内使用[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<0>个')
						}	
					else if(Item_mode == 9)//诺顿分解
						{
						console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']分解[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<0>个')
						}	
					else if(Item_mode == 15)//发送邮件
						{
						console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']使用邮件发送[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<0>个')
						}
					}	
				else
					{
						if(Item_mode == 5)//城镇内
							{
							console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']城镇内失去[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<' + Item_Total_number + '>个')
							}	
						else if(Item_mode == 6)//副本内
							{
							console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']副本内失去[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<' + Item_Total_number + '>个')
							}	
						else if(Item_mode == 15)//发送邮件
							{
							console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']发送邮件[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,剩余<' + Item_Total_number + '>个')
							}
					}	

				if(reason == 3)//使用道具
				{
					UserUseItemEvent(user, item_id); //角色使用道具触发事件
					if((item_id >= 500000000) && (item_id <= 500000000))//指定代码区间
					{
						api_CUser_AddItem(user, 3037, 1)//奖励无色1个
						api_gameWorld_SendNotiPacketMessage('玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']使用了[' + api_CItem_getItemName(item_id) + ']', 14);
							
					}	
				}

				else if(reason == 5)//丢弃道具
				{
					if((item_id >= 500000000) && (item_id <= 500000000))//指定代码区间
					{
						api_CUser_AddItem(user, 3037, 1)//奖励无色1个
						api_gameWorld_SendNotiPacketMessage( rewardAmount + '玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']丢弃了[' + api_CItem_getItemName(item_id) + ']', 14);
						
							
					}
				}

				else if(reason == 9)//分解道具
				{
					if((item_id >= 500000000) && (item_id <= 500000000))//指定代码区间
					{
						api_CUser_AddItem(user, 3037, 1)//奖励无色1个
						api_gameWorld_SendNotiPacketMessage('玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']分解了[' + api_CItem_getItemName(item_id) + ']', 14);
							
					}
				}

}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
			else if(game_event == 'Item+')
{
			var itemData = CDataManager_find_item(G_CDataManager(), item_id);
			var needLevel = CItem_getUsableLevel(itemData);
			var inEquRarity = CItem_getRarity(itemData);
				if (Item_mode == 0)
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']NPC商店购买[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					}
				else if (Item_mode == 3) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']罐子或魔盒获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 4) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']副本内获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 7) //仓库取出物品
					{
					//
					} 
				else if (Item_mode == 8) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']任务奖励获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 9) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']设计图或生产[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 10) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']分解装备获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 13) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']每日恢复或娃娃机获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 15) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']商城或开礼盒获取[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					}
				else if (Item_mode == 19) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']装备破碎获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 21) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']邮箱接收获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 41) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']商店回购[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 35) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']抽奖机获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else if (Item_mode == 50) 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']开启时装礼盒[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					} 
				else 
					{
					console.log(identification + api_CUserCharacInfo_getCurCharacName(user) + ']获得[' + api_CItem_getItemName(item_id) + ']<' + Item_number + '>个,当前拥有<' + Item_Total_number + '>个');
					}

				if(reason == 4)//副本内拾取
				{
					//-----------------------------------下方为捡史诗就会公告，如果不需要整段删除-----------------------------------
					if(inEquRarity == 4)//要求品级为史诗
					{
						if(needLevel > 45)//要求等级大于10
						{
						//-------------下方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						jl_reward = 690000661 //奖励无色x5
						number = 1 //5个
						api_CUser_AddItem(user, jl_reward, number)
						//-------------上方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						
						//-------------下方为奖励点券，需要则替换数量，不需要则删除-------------
						rewardAmount = rewardAmount * 1000 //点券奖励1000点
						api_recharge_cash_cera(user, rewardAmount);
						//-------------上方为奖励点券，需要则替换数量，不需要则删除-------------
						api_gameWorld_SendNotiPacketMessage('--------------史诗资讯--------------\n玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']在地下城中获得了:\n[' + api_CItem_getItemName(item_id) + ']\n☆奖励☆[' + api_CItem_getItemName(jl_reward)+ 'x' + number + ']\n☆奖励☆[点券+' + rewardAmount + ']', 14);
						}
					}
					//-----------------------------------上方为捡史诗就会公告，如果不需要整段删除-----------------------------------
					
					
					
					//-----------------------------------下方为捡指定代码才会公告且发奖励，如果不需要整段删除-----------------------------------
					if((item_id >= 18559) && (item_id <= 18559))//33714是魔杖-极光魅影的代码，可以写区间代码，例如if((item_id >= 33714) && (item_id <= 33715))，那就是爆出33715双龙魔杖也会公告。
					{
						//-------------下方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						jl_reward = 3037 //奖励无色x5
						number = 5 //5个
						api_CUser_AddItem(user, jl_reward, number)
						//-------------上方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						
						//-------------下方为奖励点券，需要则替换数量，不需要则删除-------------
						rewardAmount = rewardAmount * 10 //点券奖励10点
						api_recharge_cash_cera(user, rewardAmount);
						//-------------上方为奖励点券，需要则替换数量，不需要则删除-------------
						api_gameWorld_SendNotiPacketMessage('--------------传说资讯--------------\n幸运玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']在地下城中获得了:\n[' + api_CItem_getItemName(item_id) + ']\n☆奖励☆[' + api_CItem_getItemName(jl_reward)+ 'x' + number + ']\n☆奖励☆[点券+' + rewardAmount + ']', 14);
					}
					//-----------------------------------上方为捡指定代码才会公告且发奖励，如果不需要整段删除-----------------------------------
					
					
					//-----------------------------------下方为捡指定代码才会公告且发奖励，如果不需要整段删除-----------------------------------
						var specialItemIds = [3037, 2749110, 2749501, 4183, 2749502, ];
						// 判断 item_id 是否在特定数值数组中
						function isItemIdSpecial(item_id) 
					{
							for (var i = 0; i < specialItemIds.length; i++) 
							{
							if (specialItemIds[i] === item_id) 
								{
								return true;
								}
							}
						return false;
					}
						// 在你的代码中使用 isItemIdSpecial 函数来判断 item_id 是否为特定数值
						if (isItemIdSpecial(item_id)) 
					{
						//-------------下方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						jl_reward = 3037 //奖励无色x5
						number = 5 //5个
						api_CUser_AddItem(user, jl_reward, number)
						//-------------上方为奖励无色，需要则替换代码和数量，不需要则删除-------------
						
						//-------------下方为奖励点券，需要则替换数量，不需要则删除-------------
						rewardAmount = rewardAmount * 10 //点券奖励10点
						api_recharge_cash_cera(user, rewardAmount);
						//-------------上方为奖励点券，需要则替换数量，不需要则删除-------------
						api_gameWorld_SendNotiPacketMessage('--------------黄昏资讯--------------\n玩家[' + api_CUserCharacInfo_getCurCharacName(user) + ']在地下城中获得:\n[' + api_CItem_getItemName(item_id) + ']\n☆奖励☆[' + api_CItem_getItemName(jl_reward)+ 'x' + number + ']\n☆奖励☆[点券+' + rewardAmount + ']', 14);
					}		
					//-----------------------------------上方为捡指定代码才会公告且发奖励，如果不需要整段删除-----------------------------------
				}
			}
//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
        },
        onLeave: function (retval) 
		{
        }
    });
}

// 发放奖励
function sendRewardsByWindow(user, reward) {
    api_CUser_Add_Item_list(user, [[jl_reward, number]]);
}

/*添加道具到背包(数组)*/
function api_CUser_Add_Item_list(user, item_list)
{
	for (var i in item_list)
	{
		api_CUser_AddItem(user, item_list[i][0], item_list[i][1]) //背包增加道具
	}
	SendItemWindowNotification(user, item_list);
}

/*获取道具时使用ui显示*/
function SendItemWindowNotification(user, item_list)
{
	var packet_guard = api_PacketGuard_PacketGuard();
	InterfacePacketBuf_put_header(packet_guard, 1, 163); //协议 ENUM_NOTIPACKET_POWER_WAR_PROLONG
	InterfacePacketBuf_put_byte(packet_guard, 1); //默认1
	InterfacePacketBuf_put_short(packet_guard, 0); //槽位id 填入0即可
	InterfacePacketBuf_put_int(packet_guard, 0); //未知 0以上即可
	InterfacePacketBuf_put_short(packet_guard, item_list.length); //道具组数
	//写入道具代码和道具数量
	for (var i = 0; i < item_list.length; i++)
	{
		InterfacePacketBuf_put_int(packet_guard, item_list[i][0]); //道具代码
		InterfacePacketBuf_put_int(packet_guard, item_list[i][1]); //道具数量 装备/时装时 任意均可
	}
	InterfacePacketBuf_finalize(packet_guard, 1); //确定发包内容
	CUser_Send(user, packet_guard); //发包
	Destroy_PacketGuard_PacketGuard(packet_guard); //清空buff区
}


function Dark_Knight_Button() //黑暗武士按键
{
	 Interceptor.attach(ptr(0x8608C98), 
	{

			onEnter: function (args) 
			 {


			},
			onLeave: function (retval) 
			{
				 //强制返回1
			retval.replace(1);
			//log('checkMoveComboSkillSlot:'+retval.toInt32());
			}
	});
}
function hook_user_inout_game_world() //角色登入和登出
{
	Interceptor.attach(ptr(0x86C4E50),
		{
			onEnter: function (args) {
				this.user = args[1];
			},
			onLeave: function (retval) {
					api_CUser_SendNotiPacketMessage(this.user, '欢迎您，[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']', 2);//上线欢迎语
					if (api_CUserCharacInfo_getCurCharacName(this.user) == '白手') //如果角色名称=白手
					{
					api_gameWorld_SendNotiPacketMessage('尊贵的榜一大佬[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);//全服播报
					} 
					else if (api_CUserCharacInfo_getCurCharacName(this.user) == '瞎子') //如果角色名称=测试2
					{
					api_gameWorld_SendNotiPacketMessage('尊贵的榜二大佬[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);//全服播报
					} 
					else if (api_CUserCharacInfo_getCurCharacName(this.user) == '测试3') //如果角色名称=测试2
					{
					api_gameWorld_SendNotiPacketMessage('尊贵的榜三大佬[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);//全服播报
					} 
			}
		});
	Interceptor.attach(ptr(0x86C5288),
		{
			onEnter: function (args) {
				var user = args[1];
			},
			onLeave: function (retval) {}
		});
}

//------------------------------------------------------------------------------------------------
function vip_Login() {
    Interceptor.attach(ptr(0x86C4E50), {
        onEnter: function (args) {
            this.user = args[1];
        },
        onLeave: function (retval) {
            var user = this.user;
            var quest_ids1 = getQuestIds1();
            var quest_ids2 = getQuestIds2();
            var quest_ids3 = getQuestIds3();
            var quest_ids4 = getQuestIds4();
            var quest_ids5 = getQuestIds5();
            var completedQuests1 = Inspection_tasks(user, quest_ids1);
            var completedQuests2 = Inspection_tasks(user, quest_ids2);
            var completedQuests3 = Inspection_tasks(user, quest_ids3);
            var completedQuests4 = Inspection_tasks(user, quest_ids4);
            var completedQuests5 = Inspection_tasks(user, quest_ids5);
			if ( completedQuests5 > 0 ) //判断任务代码5是否是完成的状态，如果是则播报且跳过后续判定
				{
				api_gameWorld_SendNotiPacketMessage('尊贵的心悦Vip5玩家[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);
				}
			else if ( completedQuests4 > 0 ) //判断任务代码4是否是完成的状态，如果是则播报且跳过后续判定
				{
				api_gameWorld_SendNotiPacketMessage('尊贵的心悦Vip4玩家[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);
				}
			else if ( completedQuests3 > 0 ) //判断任务代码3是否是完成的状态，如果是则播报且跳过后续判定
				{
				api_gameWorld_SendNotiPacketMessage('尊贵的心悦Vip3玩家[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);
				}
			else if ( completedQuests2 > 0 ) //判断任务代码2是否是完成的状态，如果是则播报且跳过后续判定
				{
				api_gameWorld_SendNotiPacketMessage('尊贵的心悦Vip2玩家[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);
				}
			else if ( completedQuests1 > 0 ) //判断任务代码1是否是完成的状态，如果是则播报
				{
				api_gameWorld_SendNotiPacketMessage('尊贵的心悦Vip1玩家[' + api_CUserCharacInfo_getCurCharacName(this.user) + ']上线了！！！', 14);
				}
        }
    });
}

function getQuestIds1() {//任务代码1
    return [20907];
}
function getQuestIds2() {//任务代码2
    return [20910];
}
function getQuestIds3() {//任务代码3
    return [20912];
}
function getQuestIds4() {//任务代码4
    return [8895];
}
function getQuestIds5() {//任务代码5
    return [1016];
}

function Inspection_tasks(user, quest_ids) {
    var WongWork_CQuestClear = CUser_getCurCharacQuestW(user).add(4);
    var completedQuests = [];
    
    for (var i = 0; i < quest_ids.length; i++) {
        var quest_id = quest_ids[i];
        if (WongWork_CQuestClear_isClearedQuest(WongWork_CQuestClear, quest_id)) {
            completedQuests.push(quest_id);
        }
    }
    
    return completedQuests;
}
//------------------------------------------------------------------------------------------------


//20条礼盒奖励
function SendItemWindowNotification1(user, item_list)
{
	var packet_guard = api_PacketGuard_PacketGuard();
	InterfacePacketBuf_put_header(packet_guard, 1, 600); //设置通讯包头,指定协议
	InterfacePacketBuf_put_byte(packet_guard, 1); //构建包头
	InterfacePacketBuf_put_byte(packet_guard, item_list.length); //压入数组量

	for (var i = 0; i < item_list.length; i++)//依次处理数组
	{
		InterfacePacketBuf_put_int(packet_guard, item_list[i][0]); //道具代码
		InterfacePacketBuf_put_byte(packet_guard, item_list[i][1]); //道具数量
	}
	InterfacePacketBuf_finalize(packet_guard, 1); //确定发包内容
	CUser_Send(user, packet_guard); //发包
	Destroy_PacketGuard_PacketGuard(packet_guard); //清空buff区
}

//角色使用道具触发事件
function UserUseItemEvent(user, item_id) 
{
	if (80301 == item_id) 
		{
		use_ftcoin_change_luck_point(user);//使用命运硬币调用幸运点函数
		} 
else if (2660373 == item_id) 
		{
		Max_Lucky_Points(user);//幸运点 99999
		} 
else if (80303 == item_id) 
		{
		Min_Lucky_Points(user);//幸运点 1
		} 
else if (80306 == item_id) 
		{
		clear_doing_questEx(user,[2702]);//完成指定代码任务并获得奖励（未清理，未完成的任务）
		} 

else if (7576 == item_id) //20条礼盒奖励，但是测试会闪退,搞不明白，自行修复。
		{
       //SendItemWindowNotification1(user,[[3037,10],[3037,10],[3037,10],[3037,50],[3037,10],[3037,10],[3037,10],[3037,10],[3037,50],[3037,10],[3037,10],[3037,10],[3037,10],[3037,50],[3037,10],[3037,10],[3037,10],[3037,10],[3037,50],[3037,10]]);
		}
}
	
//=====================================================================
// 装备镶嵌(打孔/徽章镶嵌) 黑暗武士技能槽  (合并自独立df_game_r.js插件)
//=====================================================================

//转换到本地时间
function get_timestamp() {
    var date = new Date();
    date = new Date(date.setHours(date.getHours() + 10));
    var year = date.getFullYear().toString();
    var month = (date.getMonth() + 1).toString();
    var day = date.getDate().toString();
    var hour = date.getHours().toString();
    var minute = date.getMinutes().toString();
    var second = date.getSeconds().toString();
    var ms = date.getMilliseconds().toString();
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}

//ByteArray转十六进制文本数据
function lengthCutting(str, ystr, num ,maxLength) {
	var strArr = '';
	var length = str.length;
	while(str.length < maxLength){
		str = '0'.concat(str)
	}
	for (var  i = 0; i < str.length; i += num){
		strArr = str.slice(i, i + num).concat(strArr)
	}
	return ystr+strArr;
}

//获取装备镶嵌数据,存在返回镶嵌数据,不存在返回空字节数据
function api_get_jewel_socket_data(mysql , id){
	api_MySQL_exec(mysql, 'SELECT jewel_data FROM data where equ_id = '+id+';')
		var v = Memory.alloc(30);
		v.add(0).writeU8(0)
		if(MySQL_get_n_rows(mysql) == 1){
			if(MySQL_fetch(mysql)){
				MySQL_get_binary(mysql, 0, v, 30)
			}
		}
		return v;
}

//0代表不存在,存在返回1
function api_exitjeweldata(id){
	api_MySQL_exec(mysql_frida, 'SELECT andonglishanbai_flag FROM data where equ_id = '+id+';')
	var exit = 0;
	if(MySQL_get_n_rows(mysql_frida) == 1){
		if(MySQL_fetch(mysql_frida)){
			exit = api_MySQL_get_int(mysql_frida,0);
		}
	}
	return exit;
}

//保存装备镶嵌数据,0代表保存失败 成功返回1
function save_equiment_socket(socket_data,id){
		if(api_MySQL_exec(mysql_frida, 'UPDATE data SET jewel_data = 0x'+socket_data+' WHERE equ_id = '+id+';') == 1){
			return 1;
		}
		return 0;
}

//233窗口呼出，客户端要处理才能正常。不然会闪退掉或是卡住。
function send_windows_pack_233(CUser,string){
 var packet_guard = api_PacketGuard_PacketGuard();
 InterfacePacketBuf_put_header(packet_guard, 0, 233);
 InterfacePacketBuf_put_byte(packet_guard, 1);
 InterfacePacketBuf_put_byte(packet_guard, 5);
 api_InterfacePacketBuf_put_string(packet_guard,string)
 InterfacePacketBuf_put_byte(packet_guard, 1);
 InterfacePacketBuf_finalize(packet_guard, 1);
 CUser_Send(CUser, packet_guard);
 Destroy_PacketGuard_PacketGuard(packet_guard);
}

//开孔,0代表开孔失败 成功返回标识
function add_equiment_socket(equipment_type){
/*
武器10
称号11
上衣12
头肩13
下衣14
鞋子15
腰带16
项链17
手镯18
戒指19
辅助装备20
魔法石21
*/

/*
红色:'010000000000010000000000000000000000000000000000000000000000'	A
黄色:'020000000000020000000000000000000000000000000000000000000000'	B
绿色:'040000000000040000000000000000000000000000000000000000000000'	C
蓝色:'080000000000080000000000000000000000000000000000000000000000'	D
白金:'100000000000100000000000000000000000000000000000000000000000'
*/
		var DB_JewelsocketData = '';
		switch(equipment_type){
			case 10 ://武器10	SS
			DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
			break;
			case 11 ://称号11	SS
			DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
			break;
			case 12 ://上衣12 	C
			DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
			break;
			case 13 ://头肩13	B
			DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
			break;
			case 14 ://下衣14	C
			DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
			break;
			case 15 ://鞋子15	D
			DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
			break;
			case 16 ://腰带16	A
			DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
			break;
			case 17 ://项链17	B
			DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
			break;
			case 18 ://手镯18	D
			DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
			break;
			case 19 ://戒指19	A
			DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
			break;
			case 20 ://辅助装备20	S
			DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
			break;
			case 21 ://魔法石21		S
			DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
			break;
			default:
			DB_JewelsocketData = '000000000000000000000000000000000000000000000000000000000000'
			break;
		}
		var date = get_timestamp();
		if(api_MySQL_exec(mysql_frida, 'INSERT INTO data (andonglishanbai_flag,jewel_data,date) VALUES(1,0x'+DB_JewelsocketData+',\''+date+'\');') == 1){
		api_MySQL_exec(mysql_frida, 'SELECT equ_id FROM data where date = \''+date+'\';')
			if(MySQL_get_n_rows(mysql_frida) == 1){
				if(MySQL_fetch(mysql_frida)){
					return api_MySQL_get_int(mysql_frida,0);
				}
			}
		}
		return 0;
}

//fr自带的时装徽章保存函数
function api_set_JewelSocketData(jewelSocketData, slot, emblem_item_id) {
    if (!jewelSocketData.isNull()) {
        //每个槽数据长6个字节: 2字节槽类型+4字节徽章item_id
        //镶嵌不改变槽类型, 这里只修改徽章id
        jewelSocketData.add(slot * 6 + 2).writeInt(emblem_item_id);
    }

    return;
}

//防装备刷新函数,带镶嵌数据的刷新函数
function CUser_SendUpdateItemList_DB(CUser,Slot,DB_JewelSocketData){
  var v10 = api_PacketGuard_PacketGuard();
  InterfacePacketBuf_put_header(v10, 0, 14);
  InterfacePacketBuf_put_byte(v10, 0);
  InterfacePacketBuf_put_short(v10, 1);
  var v4 = CUserCharacInfo_getCurCharacInvenW(CUser);
  CInventory_MakeItemPacket(v4,1,Slot,v10);
  InterfacePacketBuf_put_binary(v10, DB_JewelSocketData, 30);
  InterfacePacketBuf_finalize(v10, 1);
  CUser_Send(CUser, v10);
  Destroy_PacketGuard_PacketGuard(v10);
}

//装备镶嵌
function andonglishanbai_Equipment_inlay(){
	var CTitleBook_putItemData = new NativeFunction(ptr(0x08641A6A), 'int', ['pointer','pointer','int','pointer'], { "abi": "sysv" });	//称号回包
	Interceptor.replace(ptr(0x08641A6A), new NativeCallback(function(CTitleBook, PacketGuard , a3 , Inven_Item) {
		var JewelSocketData = Memory.alloc(30);
		var ret =  CTitleBook_putItemData(CTitleBook, PacketGuard , a3 , Inven_Item);
		JewelSocketData = api_get_jewel_socket_data(mysql_frida,Inven_Item.add(25).readU32())
		if(JewelSocketData.add(0).readU8() != 0){
				InterfacePacketBuf_put_binary(PacketGuard,JewelSocketData, 30);
				return ret;
			}
		return ret
	}, 'int', ['pointer','pointer','int','pointer']));

	var CUser_copyItemOption = new NativeFunction(ptr(0x08671EB2), 'int', ['pointer' , 'pointer' ,'pointer'], { "abi": "sysv" });//设计图继承
	Interceptor.replace(ptr(0x08671EB2), new NativeCallback(function(CUser, Inven_Item1 , Inven_Item2) {
		var jewelSocketID = Inven_Item2.add(25).readU32()
		Inven_Item1.add(25).writeU32(jewelSocketID)
		return CUser_copyItemOption(CUser, Inven_Item1 , Inven_Item2);
	}, 'int', ['pointer','pointer','pointer']));


	var Dispatcher_AddSocketToAvatar_dispatch_sig = new NativeFunction(ptr(0x0821A412), 'int', ['pointer','pointer','pointer'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x0821A412), new NativeCallback(function(Dispatcher_AddSocketToAvatar, CUser , PacketBuf) {//装备开孔
		var pack = Memory.alloc(0x20000)
		Memory.copy(pack,PacketBuf,1000)
		var ret = 0;
		try{
			var equ_slot = api_PacketBuf_get_short(pack);//装备所在位置
			var equitem_id = api_PacketBuf_get_int(pack);//装备代码
			var sta_slot = api_PacketBuf_get_short(pack);//道具所在位置
			var CurCharacInvenW = CUserCharacInfo_getCurCharacInvenW(CUser);//获取人物背包
			var inven_item = CInventory_getInvenRef(CurCharacInvenW, 1, equ_slot);//获取背包对应槽位的装备物品对象
			//var is_equ = inven_item.add(1).readU8()//是否为装备物品
			if( equ_slot > 56){//修改后：大于56则是时装装备   原：如果不是装备文件就调用原逻辑
				equ_slot = equ_slot - 57;
				var C_PacketBuf = api_PacketBuf_get_buf(PacketBuf)//获取原始封包数据
				C_PacketBuf.add(0).writeShort(equ_slot)//修改掉装备位置信息 时装类镶嵌从57开始。
				return Dispatcher_AddSocketToAvatar_dispatch_sig(Dispatcher_AddSocketToAvatar, CUser , PacketBuf);

			}
			var equ_id = inven_item.add(25).readU32()
			if(api_exitjeweldata(equ_id) == 1){//判断是否存在数据槽位
				CUser_SendCmdErrorPacket(CUser, 209, 19);
				return 0;
				}

			var item = CDataManager_find_item(G_CDataManager(), equitem_id);//取出pvf文件
			var ItemType = CEquipItem_GetItemType(item)	//这个地方是获取标识的 10是武器 11是称号
			if(ItemType == 10){
			send_windows_pack_233(CUser,'武器类型的装备暂不支持打孔。');
			CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死
			return 0;
			}else if(ItemType == 11){
			send_windows_pack_233(CUser,'称号类型的装备暂不支持打孔。');
			CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死，注意称号不要关闭，不然扔到称号铺炸数据！
			return 0;

			}

			var id = add_equiment_socket(ItemType)//生成槽位
			CInventory_delete_item(CurCharacInvenW, 1, sta_slot, 1, 8, 1);//删除打孔道具
			inven_item.add(25).writeU32(id)//写入槽位标识
			CUser_SendUpdateItemList(CUser,1,0,equ_slot);
			var packet_guard = api_PacketGuard_PacketGuard();
			InterfacePacketBuf_put_header(packet_guard, 1, 209);
			InterfacePacketBuf_put_byte(packet_guard, 1);
			InterfacePacketBuf_put_short(packet_guard, equ_slot+104);//装备槽位 从104开始返回给本地处理显示正确的装备
			InterfacePacketBuf_put_short(packet_guard, sta_slot);//道具槽位
			InterfacePacketBuf_finalize(packet_guard, 1);
			CUser_Send(CUser, packet_guard);
			Destroy_PacketGuard_PacketGuard(packet_guard);
		}catch(error){
			console.log(error)
		}
		return 0;
	}, 'int', ['pointer','pointer','pointer']));
	Interceptor.attach(ptr(0x8217BD6), {//装备镶嵌和时装镶嵌
        onEnter: function (args) {

            try {
				var user = args[1];
				var packet_buf = args[2];
                var state = CUser_get_state(user);
                if(state != 3){
                    return;
                }
                var avartar_inven_slot = api_PacketBuf_get_short(packet_buf);
                var avartar_item_id = api_PacketBuf_get_int(packet_buf);
                var emblem_cnt = api_PacketBuf_get_byte(packet_buf);

				//下面是参照原时装镶嵌的思路写的。个别点标记出来。
				if(avartar_inven_slot > 104){//为了不与时装镶嵌冲突,用孔位来判断,小于104是时装装备

					var equipment_inven_slot = avartar_inven_slot - 104;//取出真实装备所在背包位置值
					var inven = CUserCharacInfo_getCurCharacInvenW(user);
					var equipment = CInventory_getInvenRef(inven, 1, equipment_inven_slot);
					if (Inven_Item_isEmpty(equipment) || (Inven_Item_getKey(equipment) != avartar_item_id) || 	CUser_CheckItemLock(user, 1, equipment_inven_slot)) {
						return;
					}

					var id = equipment.add(25).readU32();
					var JewelSocketData = Memory.alloc(30);//空字节数据
					JewelSocketData = api_get_jewel_socket_data(mysql_frida,id)//取出原有的孔位以及徽章数据
					if(JewelSocketData.isNull()){//为空则不进行镶嵌
						return;
					}

					if (emblem_cnt <= 3) {
						var emblems = {};
						for (var i = 0; i < emblem_cnt; i++) {
							var emblem_inven_slot = api_PacketBuf_get_short(packet_buf);
							var emblem_item_id = api_PacketBuf_get_int(packet_buf);
							var equipment_socket_slot = api_PacketBuf_get_byte(packet_buf);
							var emblem = CInventory_getInvenRef(inven, 1, emblem_inven_slot);
							if (Inven_Item_isEmpty(emblem) || (Inven_Item_getKey(emblem) != emblem_item_id) || (	equipment_socket_slot >= 3)) {
								return;
							}

							var citem = CDataManager_find_item(G_CDataManager(), emblem_item_id);
							if (citem.isNull()) {
								return;
							}

							if (!CItem_is_stackable(citem) || (CStackableItem_getItemType(citem) != 20)) {
								return;
							}

							var emblem_socket_type = CStackableItem_getJewelTargetSocket(citem);
							var avartar_socket_type = JewelSocketData.add(equipment_socket_slot * 6).readU16();

							if (!(emblem_socket_type & avartar_socket_type)) {
								return;
							}

							emblems[equipment_socket_slot] = [emblem_inven_slot, emblem_item_id];
						}
					}

					for (var equipment_socket_slot in emblems) {
                        var emblem_inven_slot = emblems[equipment_socket_slot][0];
                        CInventory_delete_item(inven, 1, emblem_inven_slot, 1, 8, 1);
                        var emblem_item_id = emblems[equipment_socket_slot][1];
						JewelSocketData.add(2+6*equipment_socket_slot).writeU32(emblem_item_id)
                    }
					var DB_JewelSocketData = '';//用于生成镶嵌后的数据
					for(var i = 0;i<=4;i++){
						DB_JewelSocketData = lengthCutting(JewelSocketData.add(i*6).readU16().toString(16),DB_JewelSocketData,2,4)
						DB_JewelSocketData = lengthCutting(JewelSocketData.add(2+i*6).readU32().toString(16),DB_JewelSocketData,2,8)
					}
					var a = save_equiment_socket(DB_JewelSocketData,id)//保存数据,向数据库中写入数据
					if(a == 0){//0为失败
						return;
					}
					CUser_SendUpdateItemList_DB(user, equipment_inven_slot,JewelSocketData);//用于更新镶嵌后的装备显示,这里用的是带镶嵌数据的更新背包函数,并非CUser_SendUpdateItemList
					var packet_guard = api_PacketGuard_PacketGuard();
					InterfacePacketBuf_put_header(packet_guard, 1, 209);//呼出弹窗
					InterfacePacketBuf_put_byte(packet_guard, 1);
					InterfacePacketBuf_put_short(packet_guard, equipment_inven_slot+104);//装备槽位+104发送回本地让本地处理正确的数据
					InterfacePacketBuf_finalize(packet_guard, 1);
					CUser_Send(user, packet_guard);
					return;
				}
				//以下是fr自带的嵌入逻辑
                //获取时装道具
                var inven = CUserCharacInfo_getCurCharacInvenW(user);
                var avartar = CInventory_getInvenRef(inven, 2, avartar_inven_slot);

                //校验时装 数据是否合法
                if(Inven_Item_isEmpty(avartar) || (Inven_Item_getKey(avartar) != avartar_item_id) || CUser_CheckItemLock(user, 2, avartar_inven_slot))
                {
                    return;
                }

                //获取时装插槽数据
                var avartar_add_info = avartar.add(7).readInt();
                var inven_avartar_mgr = CInventory_getAvatarItemMgrR(inven);
                var jewel_socket_data = WongWork_CAvatarItemMgr_getJewelSocketData(inven_avartar_mgr, avartar_add_info);
                //log('jewel_socket_data=' + jewel_socket_data + ':' + bin2hex(jewel_socket_data, 30));

                if(jewel_socket_data.isNull())
                {
                    return;
                }

                //最多只支持3个插槽
                if(emblem_cnt <= 3)
                {
                    var emblems = {};

                    for(var i=0; i<emblem_cnt; i++)
                    {
                        //徽章所在的背包槽
                        var emblem_inven_slot = api_PacketBuf_get_short(packet_buf);
                        //徽章item_id
                        var emblem_item_id = api_PacketBuf_get_int(packet_buf);
                        //该徽章镶嵌的时装插槽id
                        var avartar_socket_slot = api_PacketBuf_get_byte(packet_buf);

                        //log('emblem_inven_slot=' + emblem_inven_slot + ', emblem_item_id=' + emblem_item_id + ', avartar_socket_slot=' + avartar_socket_slot);

                        //获取徽章道具
                        var emblem = CInventory_getInvenRef(inven, 1, emblem_inven_slot);

                        //校验徽章及插槽数据是否合法
                        if(Inven_Item_isEmpty(emblem) || (Inven_Item_getKey(emblem) != emblem_item_id) || (avartar_socket_slot >= 3))
                        {
                            return;
                        }

                        //校验徽章是否满足时装插槽颜色要求

                        //获取徽章pvf数据
                        var citem = CDataManager_find_item(G_CDataManager(), emblem_item_id);
                        if(citem.isNull())
                        {
                            return;
                        }

                        //校验徽章类型
                        if(!CItem_is_stackable(citem) ||  (CStackableItem_getItemType(citem) != 20))
                        {
                            return;
                        }

                        //获取徽章支持的插槽
                        var emblem_socket_type = CStackableItem_getJewelTargetSocket(citem);

                        //获取要镶嵌的时装插槽类型
                        var avartar_socket_type = jewel_socket_data.add(avartar_socket_slot*6).readShort();

                        if(!(emblem_socket_type & avartar_socket_type))
                        {
                            //插槽类型不匹配
                            //log('socket type not match!');
                            return;
                        }

                        emblems[avartar_socket_slot] = [emblem_inven_slot, emblem_item_id];
                    }



                    //开始镶嵌
                    for (var avartar_socket_slot in emblems) {
                        //删除徽章
                        var emblem_inven_slot = emblems[avartar_socket_slot][0];
                        CInventory_delete_item(inven, 1, emblem_inven_slot, 1, 8, 1);

                        //设置时装插槽数据
                        var emblem_item_id = emblems[avartar_socket_slot][1];
                        api_set_JewelSocketData(jewel_socket_data, avartar_socket_slot, emblem_item_id);

                        //log('徽章item_id=' + emblem_item_id + '已成功镶嵌进avartar_socket_slot=' + avartar_socket_slot + '的槽内!');
                    }

                    //时装插槽数据存档
                    DB_UpdateAvatarJewelSlot_makeRequest(CUserCharacInfo_getCurCharacNo(user), avartar.add(7).readInt(), jewel_socket_data);

                    //通知客户端时装数据已更新
                    CUser_SendUpdateItemList(user, 1, 1, avartar_inven_slot);

                    //回包给客户端
                    var packet_guard = api_PacketGuard_PacketGuard();
                    InterfacePacketBuf_put_header(packet_guard, 1, 204);
                    InterfacePacketBuf_put_int(packet_guard, 1);
                    InterfacePacketBuf_finalize(packet_guard, 1);
                    CUser_Send(user, packet_guard);
                    Destroy_PacketGuard_PacketGuard(packet_guard);

                    //log('镶嵌请求已处理完成!');
                }


            } catch (error) {
                console.log('fix_use_emblem throw Exception:' + error);
            }


        },
        onLeave: function (retval) {
            //返回值改为0  不再踢线
            retval.replace(0);
        }
    });
    Interceptor.replace(ptr(0x0815098e), new NativeCallback(function(PacketBuf, Inven_Item) {//额外数据包,发送装备镶嵌数据给本地处理
		var ret = InterfacePacketBuf_put_packet(PacketBuf, Inven_Item);
		if(Inven_Item.add(1).readU8() == 1){
			var JewelSocketData = Memory.alloc(30);
			JewelSocketData = api_get_jewel_socket_data(mysql_frida,Inven_Item.add(25).readU32())
			if(JewelSocketData.add(0).readU8() != 0){
				InterfacePacketBuf_put_binary(PacketBuf,JewelSocketData, 30);
				return ret;
				}
			}
		return ret;
	}, 'int', ['pointer','pointer']));
	var Inter_AuctionResultMyRegistedItems_dispatch_sig = new NativeFunction(ptr(0x084D7758), 'int', [ 'pointer','pointer','pointer','int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D7758), new NativeCallback(function(Inter_AuctionResultMyRegistedItems, CUser , src , a4) {//上架显示
		//每个物品占117字节 所以每个物品的偏移量是117
		var JewelSocketData = Memory.alloc(30)
		var count = src.add(5).readU8()//获取上架物品数量
		for(var i = 0;i<count;i++){//遍历写入数据
			var item_id = src.add(37+117*i).readU32();
			var item = CDataManager_find_item(G_CDataManager(), item_id);
			var item_groupname = CItem_getItemGroupName(item)
			if(item_groupname>0 && item_groupname < 59){//1-58是装备
				JewelSocketData = api_get_jewel_socket_data(mysql_frida,src.add(59+i*117).readU32())
				Memory.copy(src.add(89+i*117),JewelSocketData,30);
			}
		}
		var ret = Inter_AuctionResultMyRegistedItems_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser , src , a4)
		return ret;
	}, 'int', ['pointer','pointer','pointer','int']));
	var Inter_AuctionResultItemList_dispatch_sig = new NativeFunction(ptr(0x084D75BC), 'int', [ 'pointer','pointer','pointer','int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D75BC), new NativeCallback(function(Inter_AuctionResultMyRegistedItems, CUser , src , a4) {//搜索显示
		//每个物品占137字节 所以每个物品的偏移量是137
		var JewelSocketData = Memory.alloc(30)
		var count = src.add(5).readU8()//获取上架物品数量
		for(var i = 0;i<count;i++){//遍历写入数据
			var item_id = src.add(54+137*i).readU32();
			var item = CDataManager_find_item(G_CDataManager(), item_id);
			var item_groupname = CItem_getItemGroupName(item)
			if(item_groupname>0 && item_groupname < 59){//1-58是装备
				JewelSocketData = api_get_jewel_socket_data(mysql_frida,src.add(76+i*137).readU32())
				Memory.copy(src.add(106+i*137),JewelSocketData,30);
			}
		 }
		var ret = Inter_AuctionResultItemList_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser , src , a4)
		return ret;
	}, 'int', ['pointer','pointer','pointer','int']));
	var Inter_AuctionResultMyBidding_dispatch_sig = new NativeFunction(ptr(0x084D78F4), 'int', [ 'pointer','pointer','pointer','int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D78F4), new NativeCallback(function(Inter_AuctionResultMyRegistedItems, CUser , src , a4) {//竞拍显示
		//每个物品占125字节 所以每个物品的偏移量是125
		var JewelSocketData = Memory.alloc(30)
		var count = src.add(5).readU8()//获取上架物品数量
		 for(var i = 0;i<count;i++){//遍历写入数据
			var item_id = src.add(46+125*i).readU32();
			var item = CDataManager_find_item(G_CDataManager(), item_id);
			var item_groupname = CItem_getItemGroupName(item)
			if(item_groupname>0 && item_groupname < 59){//1-58是装备
				JewelSocketData = api_get_jewel_socket_data(mysql_frida,src.add(68+i*125).readU32())
				Memory.copy(src.add(98+i*125),JewelSocketData,30);
			}
		 }
		var ret = Inter_AuctionResultMyBidding_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser , src , a4)
		return ret;
	}, 'int', ['pointer','pointer','pointer','int']));
	Interceptor.replace(ptr(0x0814A62E), new NativeCallback(function(Inven_Item,CInven_Item) {//装备全字节复制
		Memory.copy(Inven_Item,CInven_Item,61)
		return Inven_Item;
	}, 'pointer', ['pointer','pointer']));
	Interceptor.replace(ptr(0x080CB7D8), new NativeCallback(function(Inven_Item) {//装备全字节删除
		var MReset = Memory.alloc(61)
		Memory.copy(Inven_Item,MReset,61)
		return Inven_Item;
	}, 'pointer', ['pointer']));
	Memory.patchCode(ptr(0x085A6563), 72, function (code) {//装备掉落全字节保存
        var cw = new X86Writer(code, { pc: ptr(0x085A6563)});
        cw.putLeaRegRegOffset('eax','ebp',-392);//lea eax, [ebp-188h]
		cw.putLeaRegRegOffset('ebx','ebp',-213);//lea ebx, [ebp-0D5h]
		cw.putMovRegOffsetPtrU32('esp',8,61)
		cw.putMovRegOffsetPtrReg('esp',4,'eax')
		cw.putMovRegOffsetPtrReg('esp',0,'ebx')
		cw.putCallAddress(ptr(0x0807d880))
        cw.putLeaRegRegOffset('eax','ebp',-392);//lea eax, [ebp-188h]
		cw.putLeaRegRegOffset('ebx','ebp',-300);//
		cw.putAddRegImm('ebx',0x10)//add ebx,0x10
		cw.putMovRegOffsetPtrU32('esp',8,61)//mov [esp+8],61
		cw.putMovRegOffsetPtrReg('esp',4,'eax')
		cw.putMovRegOffsetPtrReg('esp',0,'ebx')
		cw.putCallAddress(ptr(0x0807d880))
		cw.putNop()
		cw.putNop()
		cw.putNop()
		cw.putNop()
		cw.putNop()
        cw.flush();
    });
}

//黑暗武士技能槽
function HookDsSwordman_SkillSlot() {
    Interceptor.attach(ptr(0x08608D58), {
        //SkillSlot::checkMoveComboSkillSlot 返回1
            onEnter: function (args) {
            },
            onLeave: function (retval) {
                retval.replace(1)
            }
        });
    Interceptor.attach(ptr(0x08608C98), {
    //SkillSlot::checkMoveComboSkillSlot 返回1
        onEnter: function (args) {
        },
        onLeave: function (retval) {
            retval.replace(1)
        }
    });
}

//完成当前已接任务并领取奖励
function finish_one_doing_quest(user, num) {
    num = num || 1;
    if (num < 1) {
        num = 1;
    }
    if (num > 20) {
        num = 20;
    }
    var realListIndex = num - 1;
    //玩家任务信息
    var userQuestList = CUser_getCurCharacQuestW(user);

    //任务列表(保存任务id): userQuestList.add(4 * (i + 7500 + 2))
    //任务完成状态(0=已满足任务条件): userQuestList.add(4 * (i + 7520 + 2))
    //任务id
    var questId = userQuestList.add(4 * (realListIndex + 7500 + 2)).readInt();

    if (questId > 0) {
        //无条件完成任务并领取奖励
        //设置GM完成任务模式(无条件完成任务)
        CUser_setGmQuestFlag(user, 1);
        //接受任务
        CUser_quest_action(user, 33, questId, 0, 0);
        //完成任务
        CUser_quest_action(user, 35, questId, 0, 0);
        //领取任务奖励(倒数第二个参数表示领取奖励的编号, -1=领取不需要选择的奖励; 0=领取可选奖励中的第1个奖励; 1=领取可选奖励中的第二个奖励)
        CUser_quest_action(user, 36, questId, 0, 1);
        CUser_quest_action(user, 36, questId, -1, 1);

        //服务端有反作弊机制: 任务完成时间间隔不能小于1秒.  这里将上次任务完成时间清零 可以连续提交任务
        user.add(0x79644).writeInt(0);

        //关闭GM完成任务模式(不需要材料直接完成)
        CUser_setGmQuestFlag(user, 0);
    } else {
        if (realListIndex < 19) {
            finish_one_doing_quest(user, num + 1)
        } else {
            api_CUser_SendNotiPacketMessage(user, "未找到可完成的任务", 16);
        }
        return;
    }

    //通知客户端更新已完成任务列表
    CUser_send_clear_quest_list(user);

    //通知客户端更新任务列表
    var packet_guard = api_PacketGuard_PacketGuard();
    UserQuest_get_quest_info(userQuestList, packet_guard);
    CUser_Send(user, packet_guard);
    Destroy_PacketGuard_PacketGuard(packet_guard);
    api_CUser_SendNotiPacketMessage(user, "已完成列表第" + num + "个任务", 16);
}

//加载主功能
function start() {
	console.log('================frida start function start ================');
	//vip_Login();//vip等级判定,需要自行改任务代码
	//Dark_Knight_Button;//黑暗武士按键修复//需要导入PVF文件
	UserUseItemEvent//角色使用道具触发事件
	hook_user_inout_game_world();//角色登入和登出
	enable_drop_use_luck_piont(); //角色幸运值影响装备爆率
	//黑暗武士技能槽内存补丁
	Memory.protect(ptr(0x08608D7B), 3, 'rwx');
	ptr(0x08608D7B).writeByteArray([0x83, 0xF8, 0x0B]);

	Memory.protect(ptr(0x08604B1E), 4, 'rwx');
	ptr(0x08604B1E).writeByteArray([0x83, 0x7D, 0xEC, 0x07]);
	Memory.protect(ptr(0x08604B8C), 7, 'rwx');
	ptr(0x08604B8C).writeByteArray([0xC7, 0x45, 0xE4, 0x08 , 0x00 ,0x00,0x00]);
	Memory.protect(ptr(0x08604A09), 4, 'rwx');
	ptr(0x08604A09).writeByteArray([0x83, 0x7D, 0x0C, 0x07]);
	Memory.protect(ptr(0x086050b1), 7, 'rwx');
	ptr(0x086050b1).writeByteArray([0xC7,0x45,0xEC,0x08,0x00,0x00,0x00]);
	Memory.protect(ptr(0x0860511c), 7, 'rwx');
	ptr(0x0860511c).writeByteArray([0xC7,0x45,0xE8,0x08,0x00,0x00,0x00]);
	api_scheduleOnMainThread(init_db, null);//初始化数据库(含装备镶嵌数据库myequ_jewel)
	andonglishanbai_Equipment_inlay();//装备镶嵌
	HookDsSwordman_SkillSlot();//黑暗武士技能槽
	console.log('================frida start function end ================');
}

