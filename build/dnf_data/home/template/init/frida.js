//==================== frida日志落盘 ====================
//frida-gadget 16.x 的 frida.config 不支持 log.file 配置项,
//这里重写 console.log, 将frida日志(含start日志)同时写入 /data/log/frida.log
//(宿主机对应路径: dnf_data/data/log/frida.log)
(function () {
    var _f = null;
    try { _f = new File("/data/log/frida.log", "a"); } catch (e) { _f = null; }
    if (_f == null) return;
    function _ts() { try { return new Date().toLocaleString(); } catch (e) { return ""; } }
    try { _f.write("==== [" + _ts() + "] frida脚本已加载 pid=" + Process.id + " ====\n"); _f.flush(); } catch (e) {}
    var _orig = console.log;
    console.log = function (msg) {
        try { _f.write("[" + _ts() + "] " + msg + "\n"); _f.flush(); } catch (e) {}
        _orig(msg);
    };
})();

function api_PacketBuf_get_short(packet_buf) {
    var data = Memory.alloc(2);
    if (PacketBuf_get_short(packet_buf, data)) {
        return data.readShort();
    }
    throw new Error('PacketBuf_get_short Fail!');
}
function api_PacketBuf_get_int(packet_buf) {
    var data = Memory.alloc(4);
    if (PacketBuf_get_int(packet_buf, data)) {
        return data.readInt();
    }
    throw new Error('PacketBuf_get_int Fail!');
}
function api_PacketBuf_get_buf(packet_buf) {
    return packet_buf.add(20).readPointer().add(13);
}
function api_PacketBuf_get_byte(packet_buf) {
    var data = Memory.alloc(1);

    if (PacketBuf_get_byte(packet_buf, data)) {
        return data.readU8();
    }


    throw new Error('PacketBuf_get_byte Fail!');
}
function api_PacketGuard_PacketGuard() {
    var packet_guard = Memory.alloc(0x20000);
    PacketGuard_PacketGuard(packet_guard);

    return packet_guard;
}
//自用函数
var strlen = new NativeFunction(ptr(0x0807E3B0), 'int', ['pointer'], { "abi": "sysv" });
//获取副本id
var CDungeon_get_index = new NativeFunction(ptr(0x080FDCF0), 'int', ['pointer'], { "abi": "sysv" });
//绝望之塔层数
const TOD_Layer_TOD_Layer = new NativeFunction(ptr(0x085FE7B4), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
//是否魔法封印装备
var CEquipItem_IsRandomOption = new NativeFunction(ptr(0x8514E5E), 'int', ['pointer'], { "abi": "sysv" });
//解封魔法封印
var random_option_CRandomOptionItemHandle_give_option = new NativeFunction(ptr(0x85F2CC6), 'int', ['pointer', 'int', 'int', 'int', 'int', 'int', 'pointer'], { "abi": "sysv" });

//获取装备魔法封印等级
var CEquipItem_GetRandomOptionGrade = new NativeFunction(ptr(0x8514E6E), 'int', ['pointer'], { "abi": "sysv" });

function get_timestamp() {//转换到本地时间
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
function lengthCutting(str, ystr, num, maxLength) {//ByteArray转十六进制文本数据
    var strArr = '';
    var length = str.length;
    while (str.length < maxLength) {
        str = '0'.concat(str)
    }
    for (var i = 0; i < str.length; i += num) {
        strArr = str.slice(i, i + num).concat(strArr)
    }
    return ystr + strArr;
}
function api_get_jewel_socket_data(mysql, id) {//获取徽章数据,存在返回徽章数据,不存在返回空字节数据
    api_MySQL_exec(mysql, 'SELECT jewel_data FROM data where equ_id = ' + id + ';')
    var v = Memory.alloc(30);
    v.add(0).writeU8(0)
    if (MySQL_get_n_rows(mysql) == 1) {
        if (MySQL_fetch(mysql)) {
            MySQL_get_binary(mysql, 0, v, 30)
        }
    }
    return v;
}
function api_exitjeweldata(id) {//0代表不存在,存在返回1
    api_MySQL_exec(mysql_myequ_jewel, 'SELECT andonglishanbai_flag FROM data where equ_id = ' + id + ';')
    var exit = 0;
    if (MySQL_get_n_rows(mysql_myequ_jewel) == 1) {
        if (MySQL_fetch(mysql_myequ_jewel)) {
            exit = api_MySQL_get_int(mysql_myequ_jewel, 0);
        }
    }
    return exit;
}
function save_equiment_socket(socket_data, id) {//0代表保存失败 成功返回1
    if (api_MySQL_exec(mysql_myequ_jewel, 'UPDATE data SET jewel_data = 0x' + socket_data + ' WHERE equ_id = ' + id + ';') == 1) {
        return 1;
    }
    return 0;
}
function api_InterfacePacketBuf_put_string(packet_guard, s) {
    var p = Memory.allocUtf8String(s);
    var len = strlen(p);
    InterfacePacketBuf_put_int(packet_guard, len);
    InterfacePacketBuf_put_binary(packet_guard, p, len);

    return;
}
function send_windows_pack_233(CUser, string) {//233窗口呼出，客户端要处理才能正常。不然会闪退掉或是卡住。
    var packet_guard = api_PacketGuard_PacketGuard();
    InterfacePacketBuf_put_header(packet_guard, 0, 233);
    InterfacePacketBuf_put_byte(packet_guard, 1);
    InterfacePacketBuf_put_byte(packet_guard, 5);
    api_InterfacePacketBuf_put_string(packet_guard, string)
    InterfacePacketBuf_put_byte(packet_guard, 1);
    InterfacePacketBuf_finalize(packet_guard, 1);
    CUser_Send(CUser, packet_guard);
    Destroy_PacketGuard_PacketGuard(packet_guard);
}


function add_equiment_socket(equipment_type) {//0代表开孔失败 成功返回标识
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
    switch (equipment_type) {
        case 10://武器10	SS
            DB_JewelsocketData = '000000000000000000000000000000000000000000000000000000000000'
            break;
        case 11://称号11	SS
            DB_JewelsocketData = '000000000000000000000000000000000000000000000000000000000000'
            break;
        case 12://上衣12 	C
            DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
            break;
        case 13://头肩13	B
            DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
            break;
        case 14://下衣14	C
            DB_JewelsocketData = '040000000000040000000000000000000000000000000000000000000000'
            break;
        case 15://鞋子15	D
            DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
            break;
        case 16://腰带16	A
            DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
            break;
        case 17://项链17	B
            DB_JewelsocketData = '020000000000020000000000000000000000000000000000000000000000'
            break;
        case 18://手镯18	D
            DB_JewelsocketData = '080000000000080000000000000000000000000000000000000000000000'
            break;
        case 19://戒指19	A
            DB_JewelsocketData = '010000000000010000000000000000000000000000000000000000000000'
            break;
        case 20://辅助装备20	S
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        case 21://魔法石21		S
            DB_JewelsocketData = '100000000000000000000000000000000000000000000000000000000000'
            break;
        default:
            DB_JewelsocketData = '000000000000000000000000000000000000000000000000000000000000'
            break;
    }
    var date = get_timestamp();
    if (api_MySQL_exec(mysql_myequ_jewel, 'INSERT INTO data (andonglishanbai_flag,jewel_data,date) VALUES(1,0x' + DB_JewelsocketData + ',\'' + date + '\');') == 1) {
        api_MySQL_exec(mysql_myequ_jewel, 'SELECT equ_id FROM data where date = \'' + date + '\';')
        if (MySQL_get_n_rows(mysql_myequ_jewel) == 1) {
            if (MySQL_fetch(mysql_myequ_jewel)) {
                return api_MySQL_get_int(mysql_myequ_jewel, 0);
            }
        }
    }
    return 0;
}
function api_set_JewelSocketData(jewelSocketData, slot, emblem_item_id) {//fr自带的时装徽章保存函数
    if (!jewelSocketData.isNull()) {
        //每个槽数据长6个字节: 2字节槽类型+4字节徽章item_id
        //镶嵌不改变槽类型, 这里只修改徽章id
        jewelSocketData.add(slot * 6 + 2).writeInt(emblem_item_id);
    }

    return;
}
function CUser_SendUpdateItemList_DB(CUser, Slot, DB_JewelSocketData) {//防装备刷新函数,带镶嵌数据的刷新函数
    var v10 = api_PacketGuard_PacketGuard();
    InterfacePacketBuf_put_header(v10, 0, 14);
    InterfacePacketBuf_put_byte(v10, 0);
    InterfacePacketBuf_put_short(v10, 1);
    var v4 = CUserCharacInfo_getCurCharacInvenW(CUser);
    CInventory_MakeItemPacket(v4, 1, Slot, v10);
    InterfacePacketBuf_put_binary(v10, DB_JewelSocketData, 30);
    InterfacePacketBuf_finalize(v10, 1);
    CUser_Send(CUser, v10);
    Destroy_PacketGuard_PacketGuard(v10);
}
//所要用到的函数

var PacketBuf_get_byte = new NativeFunction(ptr(0x858CF22), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_get_short = new NativeFunction(ptr(0x858CFC0), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_get_int = new NativeFunction(ptr(0x858D27E), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var PacketBuf_get_binary = new NativeFunction(ptr(0x858D3B2), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DD4C), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_put_header = new NativeFunction(ptr(0x80CB8FC), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_get_len = new NativeFunction(ptr(0x0848f438), 'int', ['pointer'], { "abi": "sysv" });
var InterfacePacketBuf_put_byte = new NativeFunction(ptr(0x80CB920), 'int', ['pointer', 'uint8'], { "abi": "sysv" });
var InterfacePacketBuf_put_short = new NativeFunction(ptr(0x80D9EA4), 'int', ['pointer', 'uint16'], { "abi": "sysv" });
var InterfacePacketBuf_put_int = new NativeFunction(ptr(0x80CB93C), 'int', ['pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_put_binary = new NativeFunction(ptr(0x811DF08), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var InterfacePacketBuf_finalize = new NativeFunction(ptr(0x80CB958), 'int', ['pointer', 'int'], { "abi": "sysv" });
var Destroy_PacketGuard_PacketGuard = new NativeFunction(ptr(0x858DE80), 'int', ['pointer'], { "abi": "sysv" });
var CEquipItem_GetItemType = new NativeFunction(ptr(0x08514D26), 'int', ['pointer'], { "abi": "sysv" });
var CInventory_GetInvenRef = new NativeFunction(ptr(0x84FC1DE), 'pointer', ['pointer', 'int', 'int'], { "abi": "sysv" });
var CUser_get_state = new NativeFunction(ptr(0x80DA38C), 'int', ['pointer'], { "abi": "sysv" });
var CUser_Send = new NativeFunction(ptr(0x86485BA), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var CUser_SendCmdErrorPacket = new NativeFunction(ptr(0x867BF42), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var CUserCharacInfo_getCurCharacInvenW = new NativeFunction(ptr(0x80DA28E), 'pointer', ['pointer'], { "abi": "sysv" });
var Inven_Item_isEmpty = new NativeFunction(ptr(0x811ED66), 'int', ['pointer'], { "abi": "sysv" });
var Inven_Item_getKey = new NativeFunction(ptr(0x850D14E), 'int', ['pointer'], { "abi": "sysv" });
var CUser_CheckItemLock = new NativeFunction(ptr(0x8646942), 'int', ['pointer', 'int', 'int'], { "abi": "sysv" });
var CDataManager_find_item = new NativeFunction(ptr(0x835FA32), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
var G_CDataManager = new NativeFunction(ptr(0x80CC19B), 'pointer', [], { "abi": "sysv" });
var CItem_is_stackable = new NativeFunction(ptr(0x80F12FA), 'int', ['pointer'], { "abi": "sysv" });
var CStackableItem_GetItemType = new NativeFunction(ptr(0x8514A84), 'int', ['pointer'], { "abi": "sysv" });
var CStackableItem_getJewelTargetSocket = new NativeFunction(ptr(0x0822CA28), 'int', ['pointer'], { "abi": "sysv" });
var CUser_SendUpdateItemList = new NativeFunction(ptr(0x867C65A), 'int', ['pointer', 'int', 'int', 'int'], { "abi": "sysv" });
var CInventory_delete_item = new NativeFunction(ptr(0x850400C), 'int', ['pointer', 'int', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
var DB_UpdateAvatarJewelSlot_makeRequest = new NativeFunction(ptr(0x843081C), 'pointer', ['int', 'int', 'pointer'], { "abi": "sysv" });
var CInventory_GetAvatarItemMgrR = new NativeFunction(ptr(0x80DD576), 'pointer', ['pointer'], { "abi": "sysv" });
var WongWork_CAvatarItemMgr_getJewelSocketData = new NativeFunction(ptr(0x82F98F8), 'pointer', ['pointer', 'int'], { "abi": "sysv" });
var CUserCharacInfo_getCurCharacNo = new NativeFunction(ptr(0x80CBC4E), 'int', ['pointer'], { "abi": "sysv" });
var CItem_getItemGroupName = new NativeFunction(ptr(0x80F1312), 'int', ['pointer'], { "abi": "sysv" });
var CInventory_MakeItemPacket = new NativeFunction(ptr(0x084FC6BC), 'int', ['pointer', 'int', 'int', 'pointer'], { "abi": "sysv" });
function andonglishanbai_Equipment_inlay() {//装备镶嵌
    var CTitleBook_putItemData = new NativeFunction(ptr(0x08641A6A), 'int', ['pointer', 'pointer', 'int', 'pointer'], { "abi": "sysv" });	//称号回包
    Interceptor.replace(ptr(0x08641A6A), new NativeCallback(function (CTitleBook, PacketGuard, a3, Inven_Item) {
        var JewelSocketData = Memory.alloc(30);
        var ret = CTitleBook_putItemData(CTitleBook, PacketGuard, a3, Inven_Item);
        JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, Inven_Item.add(25).readU32())
        if (JewelSocketData.add(0).readU8() != 0) {
            InterfacePacketBuf_put_binary(PacketGuard, JewelSocketData, 30);
            return ret;
        }
        return ret
    }, 'int', ['pointer', 'pointer', 'int', 'pointer']));

    var CUser_copyItemOption = new NativeFunction(ptr(0x08671EB2), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });//设计图继承
    Interceptor.replace(ptr(0x08671EB2), new NativeCallback(function (CUser, Inven_Item1, Inven_Item2) {
        var jewelSocketID = Inven_Item2.add(25).readU32()
        Inven_Item1.add(25).writeU32(jewelSocketID)
        return CUser_copyItemOption(CUser, Inven_Item1, Inven_Item2);
    }, 'int', ['pointer', 'pointer', 'pointer']));


    var Dispatcher_AddSocketToAvatar_dispatch_sig = new NativeFunction(ptr(0x0821A412), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x0821A412), new NativeCallback(function (Dispatcher_AddSocketToAvatar, CUser, PacketBuf) {//装备开孔
        var pack = Memory.alloc(0x20000)
        Memory.copy(pack, PacketBuf, 1000)
        var ret = 0;
        try {
            var equ_slot = api_PacketBuf_get_short(pack);//装备所在位置
            var equitem_id = api_PacketBuf_get_int(pack);//装备代码
            var sta_slot = api_PacketBuf_get_short(pack);//道具所在位置
            var CurCharacInvenW = CUserCharacInfo_getCurCharacInvenW(CUser);//获取人物背包
            var inven_item = CInventory_GetInvenRef(CurCharacInvenW, 1, equ_slot);//获取背包对应槽位的装备物品对象
            //var is_equ = inven_item.add(1).readU8()//是否为装备物品
            if (equ_slot > 56) {//修改后：大于56则是时装装备   原：如果不是装备文件就调用原逻辑
                equ_slot = equ_slot - 57;
                var C_PacketBuf = api_PacketBuf_get_buf(PacketBuf)//获取原始封包数据
                C_PacketBuf.add(0).writeShort(equ_slot)//修改掉装备位置信息 时装类镶嵌从57开始。
                return Dispatcher_AddSocketToAvatar_dispatch_sig(Dispatcher_AddSocketToAvatar, CUser, PacketBuf);

            }
            var equ_id = inven_item.add(25).readU32()
            if (api_exitjeweldata(equ_id) == 1) {//判断是否存在数据槽位
                CUser_SendCmdErrorPacket(CUser, 209, 19);
                return 0;
            }

            var item = CDataManager_find_item(G_CDataManager(), equitem_id);//取出pvf文件
            var ItemType = CEquipItem_GetItemType(item)	//这个地方是获取标识的 10是武器 11是称号
            if (ItemType == 10) {
                send_windows_pack_233(CUser, '武器类型的装备暂不支持打孔。');
                CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死
                return 0;
            } else if (ItemType == 11) {
                send_windows_pack_233(CUser, '称号类型的装备暂不支持打孔。');
                CUser_SendCmdErrorPacket(CUser, 209, 0);//回包防假死，注意称号不要关闭，不然扔到称号铺炸数据！
                return 0;

            }

            var id = add_equiment_socket(ItemType)//生成槽位
            CInventory_delete_item(CurCharacInvenW, 1, sta_slot, 1, 8, 1);//删除打孔道具
            inven_item.add(25).writeU32(id)//写入槽位标识
            CUser_SendUpdateItemList(CUser, 1, 0, equ_slot);
            var packet_guard = api_PacketGuard_PacketGuard();
            InterfacePacketBuf_put_header(packet_guard, 1, 209);
            InterfacePacketBuf_put_byte(packet_guard, 1);
            InterfacePacketBuf_put_short(packet_guard, equ_slot + 104);//装备槽位 从104开始返回给本地处理显示正确的装备
            InterfacePacketBuf_put_short(packet_guard, sta_slot);//道具槽位
            InterfacePacketBuf_finalize(packet_guard, 1);
            CUser_Send(CUser, packet_guard);
            Destroy_PacketGuard_PacketGuard(packet_guard);
        } catch (error) {
            console.log(error)
        }
        return 0;
    }, 'int', ['pointer', 'pointer', 'pointer']));
    Interceptor.attach(ptr(0x8217BD6), {//装备镶嵌和时装镶嵌
        onEnter: function (args) {

            try {
                var user = args[1];
                var packet_buf = args[2];
                var state = CUser_get_state(user);
                if (state != 3) {
                    return;
                }
                var avartar_inven_slot = api_PacketBuf_get_short(packet_buf);
                var avartar_item_id = api_PacketBuf_get_int(packet_buf);
                var emblem_cnt = api_PacketBuf_get_byte(packet_buf);

                //下面是参照原时装镶嵌的思路写的。个别点标记出来。
                if (avartar_inven_slot > 104) {//为了不与时装镶嵌冲突,用孔位来判断,小于104是时装装备

                    var equipment_inven_slot = avartar_inven_slot - 104;//取出真实装备所在背包位置值
                    var inven = CUserCharacInfo_getCurCharacInvenW(user);
                    var equipment = CInventory_GetInvenRef(inven, 1, equipment_inven_slot);
                    if (Inven_Item_isEmpty(equipment) || (Inven_Item_getKey(equipment) != avartar_item_id) || CUser_CheckItemLock(user, 1, equipment_inven_slot)) {
                        return;
                    }

                    var id = equipment.add(25).readU32();
                    var JewelSocketData = Memory.alloc(30);//空字节数据
                    JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, id)//取出原有的孔位以及徽章数据
                    if (JewelSocketData.isNull()) {//为空则不进行镶嵌
                        return;
                    }

                    if (emblem_cnt <= 3) {
                        var emblems = {};
                        for (var i = 0; i < emblem_cnt; i++) {
                            var emblem_inven_slot = api_PacketBuf_get_short(packet_buf);
                            var emblem_item_id = api_PacketBuf_get_int(packet_buf);
                            var equipment_socket_slot = api_PacketBuf_get_byte(packet_buf);
                            var emblem = CInventory_GetInvenRef(inven, 1, emblem_inven_slot);
                            if (Inven_Item_isEmpty(emblem) || (Inven_Item_getKey(emblem) != emblem_item_id) || (equipment_socket_slot >= 3)) {
                                return;
                            }

                            var citem = CDataManager_find_item(G_CDataManager(), emblem_item_id);
                            if (citem.isNull()) {
                                return;
                            }

                            if (!CItem_is_stackable(citem) || (CStackableItem_GetItemType(citem) != 20)) {
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
                        JewelSocketData.add(2 + 6 * equipment_socket_slot).writeU32(emblem_item_id)
                    }
                    var DB_JewelSocketData = '';//用于生成镶嵌后的数据
                    for (var i = 0; i <= 4; i++) {
                        DB_JewelSocketData = lengthCutting(JewelSocketData.add(i * 6).readU16().toString(16), DB_JewelSocketData, 2, 4)
                        DB_JewelSocketData = lengthCutting(JewelSocketData.add(2 + i * 6).readU32().toString(16), DB_JewelSocketData, 2, 8)
                    }
                    var a = save_equiment_socket(DB_JewelSocketData, id)//保存数据,向数据库中写入数据
                    if (a == 0) {//0为失败
                        return;
                    }
                    CUser_SendUpdateItemList_DB(user, equipment_inven_slot, JewelSocketData);//用于更新镶嵌后的装备显示,这里用的是带镶嵌数据的更新背包函数,并非CUser_SendUpdateItemList
                    var packet_guard = api_PacketGuard_PacketGuard();
                    InterfacePacketBuf_put_header(packet_guard, 1, 209);//呼出弹窗
                    InterfacePacketBuf_put_byte(packet_guard, 1);
                    InterfacePacketBuf_put_short(packet_guard, equipment_inven_slot + 104);//装备槽位+104发送回本地让本地处理正确的数据 
                    InterfacePacketBuf_finalize(packet_guard, 1);
                    CUser_Send(user, packet_guard);
                    return;
                }
                //以下是fr自带的嵌入逻辑
                //获取时装道具
                var inven = CUserCharacInfo_getCurCharacInvenW(user);
                var avartar = CInventory_GetInvenRef(inven, 2, avartar_inven_slot);

                //校验时装 数据是否合法
                if (Inven_Item_isEmpty(avartar) || (Inven_Item_getKey(avartar) != avartar_item_id) || CUser_CheckItemLock(user, 2, avartar_inven_slot)) {
                    return;
                }

                //获取时装插槽数据
                var avartar_add_info = avartar.add(7).readInt();
                var inven_avartar_mgr = CInventory_GetAvatarItemMgrR(inven);
                var jewel_socket_data = WongWork_CAvatarItemMgr_getJewelSocketData(inven_avartar_mgr, avartar_add_info);
                //log('jewel_socket_data=' + jewel_socket_data + ':' + bin2hex(jewel_socket_data, 30));

                if (jewel_socket_data.isNull()) {
                    return;
                }

                //最多只支持3个插槽
                if (emblem_cnt <= 3) {
                    var emblems = {};

                    for (var i = 0; i < emblem_cnt; i++) {
                        //徽章所在的背包槽
                        var emblem_inven_slot = api_PacketBuf_get_short(packet_buf);
                        //徽章item_id
                        var emblem_item_id = api_PacketBuf_get_int(packet_buf);
                        //该徽章镶嵌的时装插槽id
                        var avartar_socket_slot = api_PacketBuf_get_byte(packet_buf);

                        //log('emblem_inven_slot=' + emblem_inven_slot + ', emblem_item_id=' + emblem_item_id + ', avartar_socket_slot=' + avartar_socket_slot);

                        //获取徽章道具
                        var emblem = CInventory_GetInvenRef(inven, 1, emblem_inven_slot);

                        //校验徽章及插槽数据是否合法
                        if (Inven_Item_isEmpty(emblem) || (Inven_Item_getKey(emblem) != emblem_item_id) || (avartar_socket_slot >= 3)) {
                            return;
                        }

                        //校验徽章是否满足时装插槽颜色要求

                        //获取徽章pvf数据
                        var citem = CDataManager_find_item(G_CDataManager(), emblem_item_id);
                        if (citem.isNull()) {
                            return;
                        }

                        //校验徽章类型
                        if (!CItem_is_stackable(citem) || (CStackableItem_GetItemType(citem) != 20)) {
                            return;
                        }

                        //获取徽章支持的插槽
                        var emblem_socket_type = CStackableItem_getJewelTargetSocket(citem);

                        //获取要镶嵌的时装插槽类型
                        var avartar_socket_type = jewel_socket_data.add(avartar_socket_slot * 6).readShort();

                        if (!(emblem_socket_type & avartar_socket_type)) {
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
    var InterfacePacketBuf_put_packet = new NativeFunction(ptr(0x0815098e), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x0815098e), new NativeCallback(function (PacketBuf, Inven_Item) {//额外数据包,发送装备镶嵌数据给本地处理
        var ret = InterfacePacketBuf_put_packet(PacketBuf, Inven_Item);
        if (Inven_Item.add(1).readU8() == 1) {
            var JewelSocketData = Memory.alloc(30);
            JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, Inven_Item.add(25).readU32())
            if (JewelSocketData.add(0).readU8() != 0) {
                InterfacePacketBuf_put_binary(PacketBuf, JewelSocketData, 30);
                return ret;
            }
        }
        return ret;
    }, 'int', ['pointer', 'pointer']));
    var Inter_AuctionResultMyRegistedItems_dispatch_sig = new NativeFunction(ptr(0x084D7758), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D7758), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//上架显示
        //每个物品占117字节 所以每个物品的偏移量是117
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(37 + 117 * i).readU32();
            var item = CDataManager_find_item(G_CDataManager(), item_id);
            var item_groupname = CItem_getItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, src.add(59 + i * 117).readU32())
                Memory.copy(src.add(89 + i * 117), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultMyRegistedItems_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    var Inter_AuctionResultItemList_dispatch_sig = new NativeFunction(ptr(0x084D75BC), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D75BC), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//搜索显示
        //每个物品占137字节 所以每个物品的偏移量是137
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(54 + 137 * i).readU32();
            var item = CDataManager_find_item(G_CDataManager(), item_id);
            var item_groupname = CItem_getItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, src.add(76 + i * 137).readU32())
                Memory.copy(src.add(106 + i * 137), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultItemList_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    var Inter_AuctionResultMyBidding_dispatch_sig = new NativeFunction(ptr(0x084D78F4), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
    Interceptor.replace(ptr(0x084D78F4), new NativeCallback(function (Inter_AuctionResultMyRegistedItems, CUser, src, a4) {//竞拍显示
        //每个物品占125字节 所以每个物品的偏移量是125
        var JewelSocketData = Memory.alloc(30)
        var count = src.add(5).readU8()//获取上架物品数量
        for (var i = 0; i < count; i++) {//遍历写入数据
            var item_id = src.add(46 + 125 * i).readU32();
            var item = CDataManager_find_item(G_CDataManager(), item_id);
            var item_groupname = CItem_getItemGroupName(item)
            if (item_groupname > 0 && item_groupname < 59) {//1-58是装备
                JewelSocketData = api_get_jewel_socket_data(mysql_myequ_jewel, src.add(68 + i * 125).readU32())
                Memory.copy(src.add(98 + i * 125), JewelSocketData, 30);
            }
        }
        var ret = Inter_AuctionResultMyBidding_dispatch_sig(Inter_AuctionResultMyRegistedItems, CUser, src, a4)
        return ret;
    }, 'int', ['pointer', 'pointer', 'pointer', 'int']));
    Interceptor.replace(ptr(0x0814A62E), new NativeCallback(function (Inven_Item, CInven_Item) {//装备全字节复制
        Memory.copy(Inven_Item, CInven_Item, 61)
        return Inven_Item;
    }, 'pointer', ['pointer', 'pointer']));
    Interceptor.replace(ptr(0x080CB7D8), new NativeCallback(function (Inven_Item) {//装备全字节删除
        var MReset = Memory.alloc(61)
        Memory.copy(Inven_Item, MReset, 61)
        return Inven_Item;
    }, 'pointer', ['pointer']));
    Memory.patchCode(ptr(0x085A6563), 72, function (code) {//装备掉落全字节保存
        var cw = new X86Writer(code, { pc: ptr(0x085A6563) });
        cw.putLeaRegRegOffset('eax', 'ebp', -392);//lea eax, [ebp-188h]
        cw.putLeaRegRegOffset('ebx', 'ebp', -213);//lea ebx, [ebp-0D5h]
        cw.putMovRegOffsetPtrU32('esp', 8, 61)
        cw.putMovRegOffsetPtrReg('esp', 4, 'eax')
        cw.putMovRegOffsetPtrReg('esp', 0, 'ebx')
        cw.putCallAddress(ptr(0x0807d880))
        cw.putLeaRegRegOffset('eax', 'ebp', -392);//lea eax, [ebp-188h]
        cw.putLeaRegRegOffset('ebx', 'ebp', -300);//
        cw.putAddRegImm('ebx', 0x10)//add ebx,0x10
        cw.putMovRegOffsetPtrU32('esp', 8, 61)//mov [esp+8],61
        cw.putMovRegOffsetPtrReg('esp', 4, 'eax')
        cw.putMovRegOffsetPtrReg('esp', 0, 'ebx')
        cw.putCallAddress(ptr(0x0807d880))
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.putNop()
        cw.flush();
    });
    Memory.patchCode(ptr(0x0820154E), 12, function (code) {//装备调整箱强制最上级,我用的功能,你不用可以删除掉
        var cw = new X86Writer(code, { pc: ptr(0x0820154E) });
        cw.putMovRegU32('eax', 0x5);
        cw.putNop()
        cw.putNop()
        cw.putMovRegU32('eax', 0x5);
        cw.flush();
    });
}

var Guard_Mutex_Guard = new NativeFunction(ptr(0x810544C), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var Destroy_Guard_Mutex_Guard = new NativeFunction(ptr(0x8105468), 'int', ['pointer'], { "abi": "sysv" });
var G_TimerQueue = new NativeFunction(ptr(0x80F647C), 'pointer', [], { "abi": "sysv" });
var timer_dispatcher_list = [];
function api_scheduleOnMainThread(f, args) {
    //线程安全
    var guard = api_Guard_Mutex_Guard();

    timer_dispatcher_list.push([f, args]);

    Destroy_Guard_Mutex_Guard(guard);

    return;
}
function api_Guard_Mutex_Guard() {
    var a1 = Memory.alloc(100);
    Guard_Mutex_Guard(a1, G_TimerQueue().add(16));

    return a1;
}
function do_timer_dispatch() {
    //当前待处理的定时器任务列表
    var task_list = [];

    //线程安全
    var guard = api_Guard_Mutex_Guard();

    //依次取出队列中的任务
    while (timer_dispatcher_list.length > 0) {
        //先入先出
        var task = timer_dispatcher_list.shift();
        task_list.push(task);
    }

    Destroy_Guard_Mutex_Guard(guard);

    //执行任务
    for (var i = 0; i < task_list.length; ++i) {
        var task = task_list[i];

        var f = task[0];
        var args = task[1];

        f.apply(null, args);
    }
}
function hook_TimerDispatcher_dispatch() {
    Interceptor.attach(ptr(0x8632A18), {

        onEnter: function (args) {
        },
        onLeave: function (retval) {
            do_timer_dispatch();
        }
    });
}

//MYSQL操作
//游戏中已打开的数据库索引(游戏数据库非线程安全 谨慎操作)
var TAIWAN_CAIN = 2;
var DBMgr_GetDBHandle = new NativeFunction(ptr(0x83F523E), 'pointer', ['pointer', 'int', 'int'], { "abi": "sysv" });
var MySQL_MySQL = new NativeFunction(ptr(0x83F3AC8), 'pointer', ['pointer'], { "abi": "sysv" });
var MySQL_init = new NativeFunction(ptr(0x83F3CE4), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_open = new NativeFunction(ptr(0x83F4024), 'int', ['pointer', 'pointer', 'int', 'pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var MySQL_close = new NativeFunction(ptr(0x83F3E74), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_set_query_2 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var MySQL_set_query_3 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_set_query_4 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int'], { "abi": "sysv" });
var MySQL_set_query_5 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int'], { "abi": "sysv" });
var MySQL_set_query_6 = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'int', 'int', 'int', 'int'], { "abi": "sysv" });
var MySQL_exec = new NativeFunction(ptr(0x83F4326), 'int', ['pointer', 'int'], { "abi": "sysv" });
var MySQL_exec_query = new NativeFunction(ptr(0x083F5348), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_get_n_rows = new NativeFunction(ptr(0x80E236C), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_fetch = new NativeFunction(ptr(0x83F44BC), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_get_int = new NativeFunction(ptr(0x811692C), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_get_uint = new NativeFunction(ptr(0x80E22F2), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_get_ulonglong = new NativeFunction(ptr(0x81754C8), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_get_ushort = new NativeFunction(ptr(0x8116990), 'int', ['pointer'], { "abi": "sysv" });
var MySQL_get_float = new NativeFunction(ptr(0x844D6D0), 'int', ['pointer', 'int', 'pointer'], { "abi": "sysv" });
var MySQL_get_binary = new NativeFunction(ptr(0x812531A), 'int', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_get_binary_length = new NativeFunction(ptr(0x81253DE), 'int', ['pointer', 'int'], { "abi": "sysv" });
var MySQL_get_str = new NativeFunction(ptr(0x80ECDEA), 'int', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_blob_to_str = new NativeFunction(ptr(0x83F452A), 'pointer', ['pointer', 'int', 'pointer', 'int'], { "abi": "sysv" });
var compress_zip = new NativeFunction(ptr(0x86B201F), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
var uncompress_zip = new NativeFunction(ptr(0x86B2102), 'int', ['pointer', 'pointer', 'pointer', 'int'], { "abi": "sysv" });
var MySQL_set_query_3_ptr = new NativeFunction(ptr(0x83F41C0), 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
var mysql_taiwan_cain = null;
var mysql_taiwan_cain_2nd = null;
var mysql_myequ_jewel = null;
var mysql_frida = null;
//打开数据库
function api_MYSQL_open(db_name, db_ip, db_port, db_account, db_password) {
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
    if (ret) {
        //log('Connect MYSQL DB <' + db_name + '> SUCCESS!');
        return mysql;
    }

    return null;
}
//mysql查询(返回mysql句柄)(注意线程安全)
function api_MySQL_exec(mysql, sql) {
    var sql_ptr = Memory.allocUtf8String(sql);

    MySQL_set_query_2(mysql, sql_ptr);

    return MySQL_exec(mysql, 1);
}

//查询sql结果
//使用前务必保证api_MySQL_exec返回0
//并且MySQL_get_n_rows与预期一致
function api_MySQL_get_int(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_get_int(mysql, field_index, v))
        return v.readInt();
    //log('api_MySQL_get_int Fail!!!');
    return null;
}
function api_MySQL_get_uint(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_get_uint(mysql, field_index, v))
        return v.readUInt();
    //log('api_MySQL_get_uint Fail!!!');
    return null;
}
function api_MySQL_get_short(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_get_short(mysql, field_index, v))
        return v.readShort();
    //log('MySQL_get_short Fail!!!');
    return null;
}
function api_MySQL_get_float(mysql, field_index) {
    var v = Memory.alloc(4);
    if (1 == MySQL_get_float(mysql, field_index, v))
        return v.readFloat();
    //log('MySQL_get_float Fail!!!');
    return null;
}
function api_MySQL_get_str(mysql, field_index) {
    var binary_length = MySQL_get_binary_length(mysql, field_index);
    if (binary_length > 0) {
        var v = Memory.alloc(binary_length);
        if (1 == MySQL_get_binary(mysql, field_index, v, binary_length))
            return v.readUtf8String(binary_length);
    }

    //log('MySQL_get_str Fail!!!');
    return null;
}
function api_MySQL_get_binary(mysql, field_index) {
    var binary_length = MySQL_get_binary_length(mysql, field_index);
    if (binary_length > 0) {
        var v = Memory.alloc(binary_length);
        if (1 == MySQL_get_binary(mysql, field_index, v, binary_length))
            return v.readByteArray(binary_length);
    }

    //log('api_MySQL_get_binary Fail!!!');
    return null;
}
//初始化数据库(打开数据库/建库建表/数据库字段扩展)
function init_db() {
    console.log("mysql_taiwan_cain = api_MYSQL_open('taiwan_cain', '127.0.0.1', 3306, 'game', 'uu5!^%jg');")
    //打开数据库连接
    if (mysql_taiwan_cain == null) {
        mysql_taiwan_cain = api_MYSQL_open('taiwan_cain', '127.0.0.1', 3306, 'game', 'uu5!^%jg');
    }
    if (mysql_taiwan_cain_2nd == null) {
        mysql_taiwan_cain_2nd = api_MYSQL_open('taiwan_cain_2nd', '127.0.0.1', 3306, 'game', 'uu5!^%jg');
    }
    api_MySQL_exec(mysql_taiwan_cain, 'create database if not exists myequ_jewel default charset utf8;');
    if (mysql_myequ_jewel == null) {
        mysql_myequ_jewel = api_MYSQL_open('myequ_jewel', '127.0.0.1', 3306, 'game', 'uu5!^%jg');
    }

    api_MySQL_exec(mysql_myequ_jewel, 'CREATE TABLE data (\
        equ_id int(11) AUTO_INCREMENT, jewel_data blob NOT NULL,andonglishanbai_flag int(11),date datetime,\
        PRIMARY KEY  (equ_id)\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8,AUTO_INCREMENT = 150;');//创建数据库，排序从150开始，也可以从大一点的数值开始

    //拍卖行/金币寄售自动化: 建 frida 库 + 打开连接 + 启动消费者模块(见下方消费者模块)
    api_MySQL_exec(mysql_taiwan_cain, 'create database if not exists frida default charset utf8;');
    if (mysql_frida == null) {
        mysql_frida = api_MYSQL_open('frida', '127.0.0.1', 3306, 'game', 'uu5!^%jg');
    }
    auction_module_init();
}
//关闭数据库（卸载插件前调用）
function uninit_db() {
    //关闭数据库连接
    if (mysql_taiwan_cain) {
        MySQL_close(mysql_taiwan_cain);
        mysql_taiwan_cain = null;
    }

    if (mysql_myequ_jewel) {
        MySQL_close(mysql_myequ_jewel);
        mysql_myequ_jewel = null;
    }
    if (mysql_frida) {
        MySQL_close(mysql_frida);
        mysql_frida = null;
    }
    if (mysql_taiwan_cain_2nd) {
        MySQL_close(mysql_taiwan_cain_2nd);
        mysql_taiwan_cain_2nd = null;
    }
}

//修复绝望之塔 skip_user_apc: 为true时, 跳过每10层的UserAPC
function fix_TOD(skip_user_apc) {
    //每日进入次数限制
    //TOD_UserState::getEnterCount
    Interceptor.attach(ptr(0x08643872),
        {
            onEnter: function (args) {
                //今日已进入次数强制清零
                args[0].add(0x10).writeInt(0);
            },
            onLeave: function (retval) {
            }
        });

    //每10层挑战玩家APC 服务器内角色不足10个无法进入
    if (skip_user_apc) {
        //跳过10/20/.../90层
        //TOD_UserState::getTodayEnterLayer
        Interceptor.attach(ptr(0x0864383E),
            {

                onEnter: function (args) {
                    //绝望之塔当前层数
                    var today_enter_layer = args[1].add(0x14).readShort();

                    if (((today_enter_layer % 10) == 9) && (today_enter_layer > 0) && (today_enter_layer < 99)) {
                        //当前层数为10的倍数时  直接进入下一层
                        args[1].add(0x14).writeShort(today_enter_layer + 1);
                    }
                },
                onLeave: function (retval) {
                }
            });
    }

    //修复金币异常
    //CParty::UseAncientDungeonItems
    var CParty_UseAncientDungeonItems_ptr = ptr(0x859EAC2);
    var CParty_UseAncientDungeonItems = new NativeFunction(CParty_UseAncientDungeonItems_ptr, 'int', ['pointer', 'pointer', 'pointer', 'pointer'], { "abi": "sysv" });
    Interceptor.replace(CParty_UseAncientDungeonItems_ptr, new NativeCallback(function (party, dungeon, inven_item, a4) {
        //当前进入的地下城id
        var dungeon_index = CDungeon_get_index(dungeon);
        //根据地下城id判断是否为绝望之塔
        if ((dungeon_index >= 11008) && (dungeon_index <= 11107)) {
            //绝望之塔 不再扣除金币
            return 1;
        }
        //其他副本执行原始扣除道具逻辑
        return CParty_UseAncientDungeonItems(party, dungeon, inven_item, a4);
    }, 'int', ['pointer', 'pointer', 'pointer', 'pointer']));
}

// 回归勇士时间设置
function set_return_user(day) {
    var time = day * 86400;
    Memory.protect(ptr(0x84C753D), 32, 'rwx');
    ptr(0x84C753D).writeU32(time);
}

//忽略副本门口禁止摆摊
function Privatestore_IgnoreNearDungeon() {
    Interceptor.attach(ptr(0x085C5082), {
        onEnter: function (args) {
        },
        onLeave: function (retval) {
            //获取返回值
            var returnValue = retval.toInt32();
            console.log('Return Value:' + returnValue);
            //强制返回1
            retval.replace(1);
        }
    });
}

//解除每日创建角色数量限制
function disable_check_create_character_limit() {
    //DB_CreateCharac::CheckLimitCreateNewCharac
    Interceptor.attach(ptr(0x8401922),
        {
            onEnter: function (args) {
            },
            onLeave: function (retval) {
                //强制返回允许创建
                retval.replace(1);
            }
        });
}

//取消新账号送成长契约
function InterSelectMobileAuthReward() {
    //还原 InterSelectMobileAuthReward::dispatch_sig 函数
    var Defptr = ptr(0x08161384);
    var value = Defptr.readU8()
    if (value != 0x0F) {
        Memory.protect(Defptr, 10, 'rwx');
        Defptr.writeShort(0x840F);
    }
    //重写InterSelectMobileAuthReward::dispatch_sig 函数
    var Inter_DispatchPr = ptr(0x0816132A);
    var Inter_Dispatch = new NativeFunction(Inter_DispatchPr, 'int', ['pointer', 'pointer', 'pointer'], { "abi": "sysv" });
    Interceptor.replace(Inter_DispatchPr, new NativeCallback(function (InterSelectMobileAuthReward, CUser, a3) {
        //var Inter_DispatchOpen = true;
        var Inter_DispatchOpen = false;
        if (Inter_DispatchOpen) {
            a3.add(4).writeInt(0);
            return Inter_Dispatch(InterSelectMobileAuthReward, CUser, a3); //执行原函数发送成长契约
        }
        return 0; //取消新账号送成长契约    返回0表示正常返回
    }, 'int', ['pointer', 'pointer', 'pointer']));
}

//设置装备解锁时间
var CUser_OnItemUnlockWaitTimeout = new NativeFunction(ptr(0x8646912), "int", ["pointer"], { abi: "sysv" });
function set_equipment_unlock_time(second) {
    //std::_Rb_tree_iterator<std::pair<uchar const,stItemLockInfo>>::operator->(void)	085432CC	
    Interceptor.attach(ptr(0x85432CC), {
        onEnter: function (args) {

        },
        onLeave: function (retval) {
            var time = retval.add(4).readU32() - 259200 + second;
            console.log("set_equipment_unlock_time: " + time + "s");
            retval.add(4).writeU32(time);
        }
    });

    //item_lock::CItemLock::DoItemUnlock(CUser *,int,int)	0854231A	
    Interceptor.attach(ptr(0x854231A), {
        onEnter: function (args) {
            this.user = args[1];
        },
        onLeave: function (retval) {
            second > 0 ? api_scheduleOnMainThread_delay(CUser_OnItemUnlockWaitTimeout, [this.user], 1E3 * second) : CUser_OnItemUnlockWaitTimeout(this.user);
        }
    });
}

// 移动药剂扩展ID
function Fix_TeleportItem() {
    Memory.protect(ptr(0x081D0651), 2, 'rwx'); // 赋予内存地址可读写执行权限
    Memory.patchCode(ptr(0x081D0651), 2, function (code) {
        code.writeByteArray([0xeb, 0x24]); // 写入2字节指令（x86短跳转）
    });
}

//魔法封印属性转换时可以继承
function change_random_option_inherit() {
    //random_option::CRandomOptionItemHandle::change_option
    Interceptor.attach(ptr(0x85F3340),
        {
            onEnter: function (args) {
                //保存原始魔法封印属性
                this.random_option = args[7];
                //本次变换的属性编号
                this.change_random_option_index = args[6].toInt32();
                //记录原始属性
                this.random_optio_type = this.random_option.add(3 * this.change_random_option_index).readU8();
                this.random_optio_value_1 = this.random_option.add(3 * this.change_random_option_index + 1).readU8();
                this.random_optio_value_2 = this.random_option.add(3 * this.change_random_option_index + 2).readU8();
            },
            onLeave: function (retval) {
                //魔法封印转换成功
                if (retval == 1) {
                    //获取未被附魔的魔法封印槽
                    var index = -1;
                    if (this.random_option.add(0).readU8() == 0)
                        index = 0;
                    else if (this.random_option.add(3).readU8() == 0)
                        index = 1;
                    else if (this.random_option.add(6).readU8() == 0)
                        index = 2;

                    //当魔法封印词条不足3个时, 若变换出等级极低的属性, 可直接附魔到装备空的魔法封印槽内
                    if (index >= 0) {
                        if ((this.random_option.add(11).readU8() <= 5) && (this.random_option.add(12).readU8() <= 5)) {
                            //魔法封印附魔
                            this.random_option.add(3 * index).writeU8(this.random_option.add(10).readU8());
                            this.random_option.add(3 * index + 1).writeU8(this.random_option.add(11).readU8());
                            this.random_option.add(3 * index + 2).writeU8(this.random_option.add(12).readU8());

                            //清空本次变换的属性(可以继续选择其他词条变换)
                            this.random_option.add(10).writeInt(0);

                            return;
                        }
                    }
                    //用变换后的词条覆盖原始魔法封印词条
                    this.random_option.add(3 * this.change_random_option_index).writeU8(this.random_option.add(10).readU8());
                    //若变换后的属性低于原来的值 则继承原有属性值 否则使用变换后的属性
                    if (this.random_option.add(11).readU8() > this.random_optio_value_1)
                        this.random_option.add(3 * this.change_random_option_index + 1).writeU8(this.random_option.add(11).readU8());
                    if (this.random_option.add(12).readU8() > this.random_optio_value_2)
                        this.random_option.add(3 * this.change_random_option_index + 2).writeU8(this.random_option.add(12).readU8());
                    //清空本次变换的属性(可以继续选择其他词条变换)
                    this.random_option.add(10).writeInt(0);
                }
            }
        });
}

//魔法封印调整、属性变化（修复魔法封印调整时不能处理特定稀有度的问题）
function fix_random_option_attribute_transformation() {
    Interceptor.attach(ptr(0x08A738A0), {
        onEnter: function (args) {
            this.rarity = args[2].toInt32()//获取稀有度
            if (this.rarity > 3) args[2] = ptr(3)//稀有度>3，则改为3
            if (this.rarity < 2) args[2] = ptr(2)//稀有度<2，则改为2
            //自己按需写
        },
        onLeave: function (retval) {
            console.log('price', retval)
            if (this.rarity == 5) retval.replace(ptr(1000000)); //如果稀有度为5，价格改为10w
            if (this.rarity == 6) retval.replace(ptr(10000000)); //如果稀有度为6，价格改为100w
            //自己按需写
        }
    });
}

//就是大多数活动会检测活动是否开启，给返回1就强开了。虽然没有啥用，但是确实有些活动真开了，不需要动数据库
//Interceptor.attach(ptr(0x080C84FA),{onLeave:function(retval){retval.replace(1)}});

//关闭周末加成(要重跑五国)
Interceptor.attach(ptr(0x08115CC6), { onEnter: function (args) { if (args[1].toInt32() == 87) args[1] = ptr(166) } });

//给角色发消息
var CUser_SendNotiPacketMessage = new NativeFunction(ptr(0x86886CE), 'int', ['pointer', 'pointer', 'int'], {
    "abi": "sysv"
});

//获取角色名字
var CUserCharacInfo_getCurCharacName = new NativeFunction(ptr(0x8101028), 'pointer', ['pointer'], {
    "abi": "sysv"
});

//给角色发消息
function api_CUser_SendNotiPacketMessage(user, msg, msg_type) {
    var p = Memory.allocUtf8String(msg);
    CUser_SendNotiPacketMessage(user, p, msg_type);
    return;
}

//获取角色名字
function api_CUserCharacInfo_getCurCharacName(user) {
    var p = CUserCharacInfo_getCurCharacName(user);
    if (p.isNull()) {
        return '';
    }
    return p.readUtf8String(-1);
}

//角色登入登出处理
function hook_user_inout_game_world() {
    //选择角色处理函数 Hook GameWorld::reach_game_world
    Interceptor.attach(ptr(0x86C4E50), {
        //函数入口, 拿到函数参数args
        onEnter: function (args) {
            //保存函数参数
            this.user = args[1];
        },
        //原函数执行完毕, 这里可以得到并修改返回值retval
        onLeave: function (retval) {
            //给角色发消息问候
            api_CUser_SendNotiPacketMessage(this.user, '【DP2挂载成功】：  \n绝望之塔√  \n镶嵌√  \n魔法封印继承√  \n魔法封印调整√  \n装备秒解锁√  \n副本摆摊√  \n建角无限制√  \n移动药剂扩展√  \nGM指令√\n感谢您不忘初心： ' + api_CUserCharacInfo_getCurCharacName(this.user), 2);
        }
    });
}

//发送道具
var CUser_AddItem = new NativeFunction(ptr(0x867B6D4), 'int', ['pointer', 'int', 'int', 'int', 'pointer', 'int'], {
    "abi": "sysv"
});

//给角色发道具
function api_CUser_AddItem(user, item_id, item_cnt) {
    var item_space = Memory.alloc(4);
    var slot = CUser_AddItem(user, item_id, item_cnt, 6, item_space, 0);

    if (slot >= 0) {
        //通知客户端有游戏道具更新
        CUser_SendUpdateItemList(user, 1, item_space.readInt(), slot);
    }

    return;
}

//玩家任务信息
var CUser_getCurCharacQuestW = new NativeFunction(ptr(0x814AA5E), 'pointer', ['pointer'], {
    "abi": "sysv"
});

//设置GM完成任务模式(无条件完成任务)
var CUser_setGmQuestFlag = new NativeFunction(ptr(0x822FC8E), 'int', ['pointer', 'int'], {
    "abi": "sysv"
});

//任务操作(33=接受任务 35=完成任务 36=领取任务奖励)
var CUser_quest_action = new NativeFunction(ptr(0x0866DA8A), 'int', ['pointer', 'int', 'int', 'int', 'int'], {
    "abi": "sysv"
});

//通知客户端更新已完成任务列表
var CUser_send_clear_quest_list = new NativeFunction(ptr(0x868B044), 'int', ['pointer'], {
    "abi": "sysv"
});

//获取任务信息
var UserQuest_get_quest_info = new NativeFunction(ptr(0x86ABBA8), 'int', ['pointer', 'pointer'], {
    "abi": "sysv"
});

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

//处理GM信息
function hook_gm_command() {
    //HOOK Dispatcher_New_Gmdebug_Command::dispatch_sig
    Interceptor.attach(ptr(0x820BBDE), {

        onEnter: function (args) {

            //获取原始封包数据
            var raw_packet_buf = api_PacketBuf_get_buf(args[2]);

            //解析GM DEBUG命令
            var msg_len = raw_packet_buf.readInt();
            var msg = raw_packet_buf.add(4).readUtf8String(msg_len);

            var user = args[1];

            //去除命令开头的 '//'
            msg = msg.slice(2);


            if (msg == 'renwu') {
                //完成任务
                finish_one_doing_quest(user, 1);
            } else if (msg.indexOf('item ') == 0) {
                //获得物品
                var msg_group = msg.split(' ');
                if (msg_group.length == 3) {
                    var item_id = parseInt(msg_group[1]);
                    var item_cnt = parseInt(msg_group[2]);
                    //发送道具到玩家背包
                    api_CUser_AddItem(user, item_id, item_cnt);
                    api_CUser_SendNotiPacketMessage(user, 'GM命令完成 发送道具成功', 1);
                } else {
                    api_CUser_SendNotiPacketMessage(user, '格式错误. item: //item 1 1', 2);
                }
            } else {
                api_CUser_SendNotiPacketMessage(user, '无效的GM指令  \n发送物品：//item 物品代码 物品数量\n完成任务：//renwu', 2);
            }
        },
        onLeave: function (retval) { }
    });
}


function load_config(path) { //加载本地配置文件
    //原脚本引用了此函数但未给出定义, 此处为占位实现
    //(当前脚本功能未使用配置文件内容, 仅保证start()不被中断)
    console.log('load_config: ' + path);
}

function start() { //加载功能
    console.log('++++++++++++++++++++ frida init ++++++++++++++++++++');
    hook_TimerDispatcher_dispatch();
    api_scheduleOnMainThread(init_db, null);
    andonglishanbai_Equipment_inlay();//装备镶嵌+时装徽章
    set_return_user(0);//勇士归来时间设置
    fix_TOD(true);//绝望之塔修复
    Privatestore_IgnoreNearDungeon();//忽略副本门口禁止摆摊
    disable_check_create_character_limit();//解除每日创建角色数量限制
    InterSelectMobileAuthReward();//取消新账号送成长契约
    set_equipment_unlock_time(1);//设置装备解锁时间
    Fix_TeleportItem(10086520);//移动药剂扩展ID
    change_random_option_inherit();//魔法封印属性转换时可以继承
    fix_random_option_attribute_transformation();//魔法封印调整、属性变化（修复魔法封印调整时不能处理特定稀有度的问题）
    hook_gm_command(); //GM指令
    load_config('frida_config.json'); //加载本地配置文件
    hook_user_inout_game_world(); //玩家上下线处理(站街战力排行)
    console.log('++++++++++++++++++++ fffffffffffffffff ++++++++++++++++++++'); //如果你在控制台看见这个表示所有功能开启成功
}

//延迟加载插件
function awake() {
    //Hook check_argv
    Interceptor.attach(ptr(0x829EA5A), {
        onEnter: function (args) { },
        onLeave: function (retval) {
            //等待check_argv函数执行结束 再加载插件
            start();
        }
    });
}

/* ===== 拍卖行/金币寄售自动化: 追加符号与消费者模块 ==================================
 * 自 dnf-market-agent 项目移植(与编排脚本 market_agent.py 通过 frida.pending_mail 对接).
 * 本脚本未定义的符号/辅助函数补齐如下(124/124 地址与本服 df_game_r 一致):
 * ============================================================================ */
//获取GameWorld实例
var G_GameWorld = new NativeFunction(ptr(0x80DA3A7), 'pointer', [], { "abi": "sysv" });
//将协议发给全频道在线玩家(state 参数=3 时只发给 state>=3 的玩家)
var GameWorld_send_all_with_state = new NativeFunction(ptr(0x86C9184), 'int', ['pointer', 'pointer', 'int'], { "abi": "sysv" });
//在线玩家列表(用于std::map遍历)
var gameworld_user_map_begin = new NativeFunction(ptr(0x80F78A6), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var gameworld_user_map_end = new NativeFunction(ptr(0x80F78CC), 'int', ['pointer', 'pointer'], { "abi": "sysv" });
var gameworld_user_map_not_equal = new NativeFunction(ptr(0x80F78F2), 'bool', ['pointer', 'pointer'], { "abi": "sysv" });
var gameworld_user_map_get = new NativeFunction(ptr(0x80F7944), 'pointer', ['pointer'], { "abi": "sysv" });
var gameworld_user_map_next = new NativeFunction(ptr(0x80F7906), 'pointer', ['pointer', 'pointer'], { "abi": "sysv" });
//Inven_Item 构造(清空背包槽结构)/取道具编号/取角色ServerGroup
var Inven_Item = new NativeFunction(ptr(0x080CB854), 'void', ['pointer'], { "abi": "sysv" });
var GetItem_index = new NativeFunction(ptr(0x08110C48), 'int', ['pointer'], { "abi": "sysv" });
var GetServerGroup = new NativeFunction(ptr(0x080CBC90), 'int', ['pointer'], { "abi": "sysv" });
//发系统邮件(单道具)
var ReqDBSendNewSystemMail = new NativeFunction(ptr(0x085555E8), 'int', ['pointer', 'pointer', 'int', 'int', 'pointer', 'int', 'int', 'int', 'char', 'char'], { "abi": "sysv" });
//服务器环境/当前频道名
var G_CEnvironment = new NativeFunction(ptr(0x080CC181), 'pointer', [], { "abi": "sysv" });
var CEnvironment_get_file_name = new NativeFunction(ptr(0x80DA39A), 'pointer', ['pointer'], { "abi": "sysv" });
function api_CEnvironment_get_file_name()
{
    var filename = CEnvironment_get_file_name(G_CEnvironment());
    return filename.readUtf8String(-1);
}
//获取道具数据
function find_item(item_id)
{
    return CDataManager_find_item(G_CDataManager(), item_id);
}

/* ===== 拍卖行自动化消费者模块(追加) ============================================
 * 与编排脚本 market_agent.py 通过 frida.pending_mail 对接.
 * 复用本脚本已有的 MySQL层 / 主线程调度 / gameworld 用户表遍历 / ReqDBSendNewSystemMail 等
 * (124/124 地址已校验一致). 中文不用 TextEncoder/TextDecoder, 走 get_binary+readUtf8String.
 * 接线: init_db() 末尾已调用 auction_module_init().
 * ============================================================================ */
var PENDING_MAIL_POLL_INTERVAL = 60000;
// 离线兜底宽限(秒): 必须 > 轮询间隔/1000, 确保各频道都至少轮询一次、玩家所在频道先在线认领;
// 之后仍 status=0 才判定"玩家各频道都不在线"走离线落库. 多频道时这是避免误判离线的关键.
var PENDING_MAIL_OFFLINE_GRACE_SEC = 120;

// 本 frida 实例(频道)唯一标识, 用作原子认领的 claimed_by; 多频道并发处理同一队列时区分赢家.
var _mail_worker_id = null;
function mail_worker_id() {
    if (_mail_worker_id == null) {
        var wid = 'unknown';
        try { wid = '' + api_CEnvironment_get_file_name(); } catch (e) {}
        _mail_worker_id = (wid.replace(/[^A-Za-z0-9_]/g, '').substring(0, 32)) || 'unknown';  // 频道名, 防注入
    }
    return _mail_worker_id;
}

function auction_log(m) {
    try { if (typeof log === 'function') { log('[auction] ' + m); return; } } catch (e) {}
    try { console.log('[auction] ' + m); } catch (e) {}
}

// 原子认领一封待发邮件: status 0->1 由 InnoDB 行锁串行化, 多频道里只有一个 UPDATE 真正改成功;
// 回读 claimed_by 确认本 worker 是否赢得 -> 杜绝多频道双发. 返回 true=本 worker 认领成功.
function api_pmail_try_claim(id) {
    var wid = mail_worker_id();
    if (!api_MySQL_exec(mysql_frida,
        "UPDATE pending_mail SET status=1, claimed_by='" + wid + "' WHERE id=" + id + " AND status=0;")) return false;
    if (!api_MySQL_exec(mysql_frida, "SELECT claimed_by FROM pending_mail WHERE id=" + id + ";")) return false;
    if (MySQL_get_n_rows(mysql_frida) < 1 || MySQL_fetch(mysql_frida) != 1) return false;
    return api_MySQL_get_str(mysql_frida, 0) === wid;
}
// 发信失败时退回 status=0, 让本轮/其它频道重试(不吞单).
function api_pmail_unclaim(id) {
    api_MySQL_exec(mysql_frida, "UPDATE pending_mail SET status=0, claimed_by=NULL WHERE id=" + id + ";");
}

function api_pmail_get_raw(mysql, field_index) {
    var len = MySQL_get_binary_length(mysql, field_index);
    if (len <= 0) return null;
    var buf = Memory.alloc(len + 1);
    if (1 != MySQL_get_binary(mysql, field_index, buf, len)) return null;
    buf.add(len).writeU8(0);
    return { ptr: buf, len: len };
}

function api_pmail_find_online(charac_no) {
    var it = api_gameworld_user_map_begin();
    var end = api_gameworld_user_map_end();
    while (gameworld_user_map_not_equal(it, end)) {
        var u = api_gameworld_user_map_get(it);
        if (CUser_get_state(u) >= 3 && CUserCharacInfo_getCurCharacNo(u) == charac_no) return u;
        api_gameworld_user_map_next(it);
    }
    return null;
}

function api_pmail_send_online(user, charac_no, title_raw, text_raw, gold) {
    var ServerGroup = GetServerGroup(user);
    var inven = Memory.alloc(100);
    Inven_Item(inven);
    // 第7参 MailDate = 邮件保留天数(实测 0 非无限制, 沿用 30); 通知由调用方按玩家去重统一发, 此处不发.
    ReqDBSendNewSystemMail(title_raw.ptr, inven, gold, charac_no, text_raw.ptr, text_raw.len, 30, ServerGroup, 0, 0);
}

// 在线发"物品邮件"(金币寄售回收的代币券): inven 装代币券道具(标记 item_id), 数量走 gold 参数(=postal.gold 列,
// 与 offline/数据库一致); 在线玩家即时收到. 装包方式复刻 CMailBoxHelperReqDBSendNewSystemMail;
// 找不到物品模板则返回 false, 由调用方回退 offline 写库. 通知由调用方按市场去重统一发.
function api_pmail_send_online_item(user, charac_no, title_raw, text_raw, item_id, count) {
    var retitem = find_item(item_id);
    if (!retitem) return false;
    var ServerGroup = GetServerGroup(user);
    var inven = Memory.alloc(100);
    Inven_Item(inven);                       // 清空 inven
    var itemid = GetItem_index(retitem);
    var itemtype = retitem.add(8).readU8();
    inven.writeU8(itemtype);
    inven.add(2).writeInt(itemid);
    // 代币券是货币物品(unlimit): 数量走 gold 参数(=postal.gold 列, 与 offline/数据库一致), inven 不写 count(add_info=0).
    // 通知由调用方按玩家去重统一发, 此处不发.
    ReqDBSendNewSystemMail(title_raw.ptr, inven, count, charac_no, text_raw.ptr, text_raw.len, 30, ServerGroup, 0, 0);
    return true;
}

function bytes_to_hex(p, len) {
    var h = '';
    for (var i = 0; i < len; i++) { var b = p.add(i).readU8(); h += (b < 16 ? '0' : '') + b.toString(16); }
    return h;
}
// name_hex/text_hex = 客户端编码(本服UTF-8)原始字节的 hex. CONVERT(UNHEX(..) USING latin1) 让字节按 latin1 进 utf8 列,
// 存储形态与游戏原生写入一致; 游戏(latin1连接)读出即原始字节 -> 客户端正确显示. 本函数编码无关, 只搬字节, 也无需转义引号.
// 邮件落库. 列含义(实测): gold = 金币(原生 type=5 成交邮件 gold=10000=押金金币);
//   add_info = 普通物品堆叠数; 货币物品(代币券 unlimit_flag=1)的"数量"走 gold 列(实测正常发放).
//   金币邮件: gold=金币数, item_id=0, mail_type=0.
//   代币券邮件: item_id=2681762, mail_type=5, gold=代币券数量, add_info=0.
// letter_id 由 AUTO_INCREMENT 分配(与游戏原生发信一致): 手动 MAX+1 会与原生/已删邮件 letter_id 撞车
//   -> 一封信挂两个附件(曾致代币券邮件混入天价金币). 用 LAST_INSERT_ID() 取回自增值.
function api_pmail_send_offline(charac_no, name_hex, text_hex, gold, item_id, mail_type, add_info) {
    if (typeof mysql_taiwan_cain_2nd === 'undefined' || mysql_taiwan_cain_2nd == null) return false;
    item_id = item_id || 0;
    mail_type = mail_type || 0;
    add_info = add_info || 0;
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var t = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' +
            pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    var nm = "CONVERT(UNHEX('" + name_hex + "') USING latin1)";
    var tx = "CONVERT(UNHEX('" + text_hex + "') USING latin1)";
    // letter 自增主键: 不指定 letter_id, 由 DB 分配, 再用 LAST_INSERT_ID() 取回
    if (!api_MySQL_exec(mysql_taiwan_cain_2nd,
        "INSERT INTO letter (charac_no,send_charac_no,send_charac_name,letter_text,reg_date,stat) VALUES (" +
        charac_no + ",0," + nm + "," + tx + ",'" + t + "',1)")) return false;
    var lid = 0;
    if (api_MySQL_exec(mysql_taiwan_cain_2nd, "SELECT LAST_INSERT_ID() AS m")) {
        if (MySQL_get_n_rows(mysql_taiwan_cain_2nd) > 0 && MySQL_fetch(mysql_taiwan_cain_2nd) == 1)
            lid = parseInt(api_MySQL_get_str(mysql_taiwan_cain_2nd, 0), 10) || 0;
    }
    if (lid <= 0) { auction_log('offline: 取 letter_id 失败, 放弃发信'); return false; }
    api_MySQL_exec(mysql_taiwan_cain_2nd,
        "INSERT INTO postal (occ_time,send_charac_no,send_charac_name,receive_charac_no,item_id,add_info,upgrade," +
        "amplify_option,gold,receive_time,unlimit_flag,letter_id,type) VALUES ('" +
        t + "',0," + nm + "," + charac_no + "," + item_id + "," + add_info + ",0,0," + (gold || 0) + ",'" + t + "',1," + lid + "," + mail_type + ")");
    return true;
}

// 代币券物品邮件的 item_id(金币寄售回收), postal.type 复刻游戏原生金币寄售成交邮件
var PMAIL_TOKEN_ITEM = 2681762;
var PMAIL_TOKEN_TYPE = 5;
// 多频道安全: 每个频道的 df_game_r 都注入一份 frida, 同抢一个 pending_mail 队列, 且"在线判断/在线发信/通知"
// 都只能针对【本频道】玩家. 故分两阶段:
//   阶段1(所有频道): 只处理"在本频道在线"的玩家 -> 原子认领后在线发信+通知; 不在本频道的留给别的频道.
//   阶段2(离线兜底): 超过宽限期仍 status=0 = 各频道都没在线认领 = 玩家各频道都不在线 -> 任一频道认领后离线落库.
// 原子认领防多频道双发; 宽限期(>轮询间隔)确保在线频道先于离线兜底处理, 避免在线玩家被误判离线.
function process_pending_auction_mail() {
    if (typeof mysql_frida === 'undefined' || mysql_frida == null) { auction_log('poll: mysql_frida null'); return; }
    // 阶段1: 在线投递(本频道在线玩家)
    process_mail_batch('SELECT id, charac_no, title, text, gold, item_id, market FROM pending_mail WHERE status=0 ORDER BY id LIMIT 20;', false);
    // 阶段2: 离线兜底(超过宽限期没被任何在线频道认领)
    process_mail_batch('SELECT id, charac_no, title, text, gold, item_id, market FROM pending_mail WHERE status=0 AND ' +
        '(created_at IS NULL OR created_at < NOW() - INTERVAL ' + PENDING_MAIL_OFFLINE_GRACE_SEC + ' SECOND) ORDER BY id LIMIT 20;', true);
}

function process_mail_batch(sql, offlineFallback) {
    // item_id 列: 0=金币邮件(在线原生发/离线写库), 非0=物品邮件(代币券, 统一写库)
    if (!api_MySQL_exec(mysql_frida, sql)) { auction_log('poll: select failed'); return; }
    var n = MySQL_get_n_rows(mysql_frida), recs = [], i;
    for (i = 0; i < n; i++) {        // 必须先把结果集读完再发信(发信会复用 mysql_frida 句柄, 冲掉结果集)
        if (MySQL_fetch(mysql_frida) != 1) break;
        var id = api_MySQL_get_int(mysql_frida, 0);
        var charac_no = api_MySQL_get_int(mysql_frida, 1);
        var title_raw = api_pmail_get_raw(mysql_frida, 2);
        var text_raw = api_pmail_get_raw(mysql_frida, 3);
        var gold = api_MySQL_get_int(mysql_frida, 4);
        var item_id = api_MySQL_get_int(mysql_frida, 5);
        var market = api_MySQL_get_str(mysql_frida, 6);
        if (id == null || charac_no == null || gold == null || !title_raw || !text_raw) continue;
        recs.push({ id: id, charac_no: charac_no, title_raw: title_raw, text_raw: text_raw, gold: gold, item_id: (item_id || 0), market: (market || 'auction') });
    }
    if (recs.length > 0) auction_log((offlineFallback ? 'poll-offline: ' : 'poll: ') + recs.length + ' @' + mail_worker_id());
    var notified = {};                       // charac_no -> 已弹通知; 同一玩家本轮多封回收邮件只通知一次
    for (i = 0; i < recs.length; i++) {
        var r = recs[i];
        try {
            var onlineUser = api_pmail_find_online(r.charac_no);      // 仅本频道
            // 阶段1: 玩家不在本频道在线 -> 不处理, 留给玩家所在频道(或宽限后离线兜底)
            if (!offlineFallback && !onlineUser) continue;
            // 原子认领: 没抢到 = 别的频道已处理 -> 跳过
            if (!api_pmail_try_claim(r.id)) continue;
            var mode, ok = false;
            try {
                if (r.item_id && r.item_id != 0) {
                    // 代币券邮件(物品): 在线走原生发信(道具装 inven, 数量走 gold), 否则离线写库(gold 列承载数量)
                    if (onlineUser && api_pmail_send_online_item(onlineUser, r.charac_no, r.title_raw, r.text_raw, r.item_id, r.gold)) {
                        mode = ' [item-online:' + r.item_id + ' x' + r.gold + ']'; ok = true;
                    } else {
                        ok = api_pmail_send_offline(r.charac_no,
                            bytes_to_hex(r.title_raw.ptr, r.title_raw.len),
                            bytes_to_hex(r.text_raw.ptr, r.text_raw.len), r.gold, r.item_id, PMAIL_TOKEN_TYPE);
                        mode = (onlineUser ? ' [item-offline(fallback):' : ' [item-offline:') + r.item_id + ' x' + r.gold + ']';
                    }
                } else {
                    // 金币邮件: 在线走原生 ReqDBSendNewSystemMail, 离线才写库
                    if (onlineUser) { api_pmail_send_online(onlineUser, r.charac_no, r.title_raw, r.text_raw, r.gold); ok = true; }
                    else { ok = api_pmail_send_offline(r.charac_no,
                        bytes_to_hex(r.title_raw.ptr, r.title_raw.len),
                        bytes_to_hex(r.text_raw.ptr, r.text_raw.len), r.gold, 0, 0); }
                    mode = onlineUser ? ' [online]' : ' [offline]';
                }
            } catch (e) { auction_log('send err id=' + r.id + ' ' + e); ok = false; }
            if (!ok) { api_pmail_unclaim(r.id); auction_log('send fail id=' + r.id + ' -> 退回 status=0 重试'); continue; }
            // 同一玩家、同一市场本轮多封回收邮件只弹一次通知(拍卖行/金币寄售各一次); 通知必在玩家所在频道
            var nkey = r.market + ':' + r.charac_no;
            if (onlineUser && !notified[nkey]) {
                var ntext = (r.market === 'cera') ? '您寄售的金币已被系统回收，请查收邮件' : '您在拍卖行的商品已被系统回收，请查收邮件';
                try { api_CUser_SendNotiPacketMessage(onlineUser, ntext, 0); } catch (e) {}
                notified[nkey] = true;
            }
            auction_log('sent id=' + r.id + ' charac=' + r.charac_no + ' gold=' + r.gold + ' @' + mail_worker_id() + mode);
        } catch (e) {
            auction_log('proc fail id=' + r.id + ' err=' + e);
        }
    }
}

// 不依赖 setTimeout(嵌入式 frida 运行时常不 pump JS 事件循环, setTimeout 会静默不触发);
// 改挂在每 tick 必触发的 TimerDispatcher::dispatch(@0x8632A18, 与 stock 同址, Interceptor.attach 可多监听器共存)
// 的 onLeave(主线程) 上, 按墙钟时间驱动轮询与整点广播.
var _pmail_last_ms = 0;
var _prenotify_last_hour = -1;
var _auction_tick_hooked = false;
function auction_dispatch_tick() {
    var d = new Date();
    var now = d.getTime();
    if (now - _pmail_last_ms >= PENDING_MAIL_POLL_INTERVAL) {
        _pmail_last_ms = now;
        try { process_pending_auction_mail(); } catch (e) { auction_log('poll err=' + e); }
    }
    if (d.getMinutes() === 59 && _prenotify_last_hour !== d.getHours()) {
        _prenotify_last_hour = d.getHours();
        try { api_GameWorld_SendNotiPacketMessage('注意：拍卖行/金币寄售即将重启，重启完成前请尽量避免交易', 0); } catch (e) {}
    }
}

function auction_module_init() {
    if (typeof mysql_frida !== 'undefined' && mysql_frida != null) {
        api_MySQL_exec(mysql_frida,
            // title/text 用 VARBINARY: 编排脚本写入原始 UTF-8 字节, 不能落进会做 utf8 校验的 VARCHAR(否则被损坏/转码).
            // 与 market_agent.py init 的列定义保持一致(VARBINARY 192/765 = 64/255 字符 * utf8 最大 3 字节).
            // market 区分市场(auction/cera), item_id 标记物品邮件(0金币/2681762代币券); 幂等键 (market,auction_id,occ_time).
            // 与 market_agent.py init 的最优结构一致(init 会 DROP 重建); 此处 CREATE IF NOT EXISTS 仅作 init 未跑时兜底.
            "CREATE TABLE IF NOT EXISTS pending_mail (id INT AUTO_INCREMENT PRIMARY KEY, market VARCHAR(16) NOT NULL DEFAULT 'auction'," +
            " auction_id BIGINT DEFAULT NULL, occ_time DATETIME NULL, charac_no INT NOT NULL, title VARBINARY(192) NOT NULL," +
            " text VARBINARY(765) NOT NULL, gold INT NOT NULL DEFAULT 0, item_id INT NOT NULL DEFAULT 0, status TINYINT NOT NULL DEFAULT 0," +
            " created_at DATETIME NULL, claimed_by VARCHAR(40) DEFAULT NULL, UNIQUE KEY uniq_listing (market, auction_id, occ_time), KEY idx_status (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8;");
        // 自愈: 旧表(无 claimed_by)补列, 供多频道原子认领用; 列已存在则 ALTER 报错被忽略(不抛).
        api_MySQL_exec(mysql_frida, "ALTER TABLE pending_mail ADD COLUMN claimed_by VARCHAR(40) DEFAULT NULL;");
        api_MySQL_exec(mysql_frida,
            // restock_list = 补货列表(原 auction_whitelist, 已与回收解耦; 回收走 item_catalog+config 规则)
            "CREATE TABLE IF NOT EXISTS restock_list (item_id INT UNSIGNED NOT NULL PRIMARY KEY, cname VARCHAR(64) DEFAULT NULL," +
            " system_price INT NOT NULL, quantity INT NOT NULL DEFAULT 1, stack_size INT NOT NULL DEFAULT 1," +
            " upgrade TINYINT UNSIGNED DEFAULT 0, endurance SMALLINT UNSIGNED DEFAULT 35, seal_flag TINYINT UNSIGNED DEFAULT 1)" +
            " ENGINE=InnoDB DEFAULT CHARSET=utf8;");
    }
    // 挂到与 stock 同一个 TimerDispatcher::dispatch(@0x8632A18); onLeave 在主线程, 直接驱动, 不经 setTimeout.
    if (!_auction_tick_hooked) {
        _auction_tick_hooked = true;
        Interceptor.attach(ptr(0x8632A18), { onLeave: function (r) { auction_dispatch_tick(); } });
    }
    auction_log('module loaded (tick-driven, poll=' + PENDING_MAIL_POLL_INTERVAL + 'ms)');
}

//框架入口
rpc.exports = {
    init: function (stage, parameters) { //脚本加载时执行
        if (stage == 'early') {
            //首次加载插件 等待服务器初始化后再加载
            awake();
        } else {
            //热重载:  直接加载
            start();
        }
    },
    dispose: function () { //脚本卸载时执行
        uninit_db();
        console.log('-------------------- frida dispose -----------------');
    }
};
