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
    api_MySQL_exec(mysql_frida, 'SELECT andonglishanbai_flag FROM data where equ_id = ' + id + ';')
    var exit = 0;
    if (MySQL_get_n_rows(mysql_frida) == 1) {
        if (MySQL_fetch(mysql_frida)) {
            exit = api_MySQL_get_int(mysql_frida, 0);
        }
    }
    return exit;
}
function save_equiment_socket(socket_data, id) {//0代表保存失败 成功返回1
    if (api_MySQL_exec(mysql_frida, 'UPDATE data SET jewel_data = 0x' + socket_data + ' WHERE equ_id = ' + id + ';') == 1) {
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
    if (api_MySQL_exec(mysql_frida, 'INSERT INTO data (andonglishanbai_flag,jewel_data,date) VALUES(1,0x' + DB_JewelsocketData + ',\'' + date + '\');') == 1) {
        api_MySQL_exec(mysql_frida, 'SELECT equ_id FROM data where date = \'' + date + '\';')
        if (MySQL_get_n_rows(mysql_frida) == 1) {
            if (MySQL_fetch(mysql_frida)) {
                return api_MySQL_get_int(mysql_frida, 0);
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
        JewelSocketData = api_get_jewel_socket_data(mysql_frida, Inven_Item.add(25).readU32())
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
                    JewelSocketData = api_get_jewel_socket_data(mysql_frida, id)//取出原有的孔位以及徽章数据
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
            JewelSocketData = api_get_jewel_socket_data(mysql_frida, Inven_Item.add(25).readU32())
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
                JewelSocketData = api_get_jewel_socket_data(mysql_frida, src.add(59 + i * 117).readU32())
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
                JewelSocketData = api_get_jewel_socket_data(mysql_frida, src.add(76 + i * 137).readU32())
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
                JewelSocketData = api_get_jewel_socket_data(mysql_frida, src.add(68 + i * 125).readU32())
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
    if (mysql_frida == null) {
        mysql_frida = api_MYSQL_open('myequ_jewel', '127.0.0.1', 3306, 'game', 'uu5!^%jg');
    }

    api_MySQL_exec(mysql_frida, 'CREATE TABLE data (\
        equ_id int(11) AUTO_INCREMENT, jewel_data blob NOT NULL,andonglishanbai_flag int(11),date datetime,\
        PRIMARY KEY  (equ_id)\
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8,AUTO_INCREMENT = 150;');//创建数据库，排序从150开始，也可以从大一点的数值开始

}
//关闭数据库（卸载插件前调用）
function uninit_db() {
    //关闭数据库连接
    if (mysql_taiwan_cain) {
        MySQL_close(mysql_taiwan_cain);
        mysql_taiwan_cain = null;
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
