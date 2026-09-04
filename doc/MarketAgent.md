# 拍卖行/金币寄售自动做市 (market_agent)

本项目已集成 [dnf-market-agent](https://github.com/ztzzxyz/dnf-market-agent)（GPL-3.0），
开箱即得两个自动做市市场，无需任何手工配置：

* **金币寄售（cera）**：系统挂售 100万~3000万 共 12 档金币包（线性 2 代币券/万金币），
  玩家用代币券购买金币；玩家寄售的过期货自动回收、货款以邮件/代币券退回。
* **拍卖行（auction）**：按补货列表自动上架物品、回收过期挂单（需先导入补货列表，见下文）。

## 工作原理

* 编排脚本 `market_agent.py`（Python 2.7）由 supervisor 常驻托管（program: `dnf:market_agent`），
  每整点 +10 秒跑一轮 `once`：无活则跳过；有活则 **停拍卖行/金币寄售 → 回收过期挂单 →
  按列表补货 → 重启服务**。停启通过容器内 `supervisorctl` 完成。
* 整点 :59 由游戏内 frida 插件广播“即将重启，请避免交易”提醒。
* 游戏进程内的 frida.js 已追加**消费者模块**（自 dnf-market-agent 移植）：每分钟轮询
  `frida.pending_mail` 队列，把系统回收/退款邮件按“在线走原生发信、离线写库兜底”投递给玩家；
  多频道并发下用 `claimed_by` 行锁原子认领，杜绝重复发信。

## 文件布局

| 位置 | 说明 |
| --- | --- |
| `/data/market_agent/market_agent.py` | 编排脚本（每次启动随镜像覆盖更新） |
| `/data/market_agent/config.json` | 运行配置（**首次**生成后不再覆盖，可直接编辑微调） |
| `/data/market_agent/vendor/pymysql` | 内置 PyMySQL 0.10.1（随镜像覆盖更新） |
| `/data/market_agent/item_catalog.sql` | 物品目录（首次导入 frida.item_catalog，约 2.6 万行） |
| `/data/market_agent/restock_list_example.sql` / `restock_list_generated.sql` | 补货列表示例（手动导入用） |
| `/data/market_agent/market_agent.log` | 每轮编排日志 |
| `/data/log/market_agent_supervisor.log` | supervisor 侧日志（进程管理页面 Tail -f 可看） |

`config.json` 由 `gen_config.py` 按 `DNF_DB_ROOT_PASSWORD` / `SERVER_GROUP_DB` 环境变量渲染生成；
想改手续费、寄售档位、补货价格等，直接编辑 `/data/market_agent/config.json` 后
执行 `python2.7 /data/market_agent/market_agent.py reset` 生效。

## 拍卖行补货列表（必读）

**金币寄售开箱即用；拍卖行默认补货列表为空，需要手动导入一次。**

镜像内置的 `restock_list_generated.sql` **已按本镜像自带的
`build/dnf_data/home/template/neople/{auction,point}/iteminfo.dat` 白名单（11210 款）
预过滤**（6521 款中剔除 592 款不在白名单内的物品），与本镜像 pvf 严格一致，可直接导入。
若你更换了 pvf/服务端版本，`iteminfo.dat` 随之变化，需重新按新白名单核对后再导入——
混入不在 `iteminfo.dat` 白名单内的物品会导致拍卖行启动时 `RegistItem()` 失败、
**整服起不来**（上游 README 坑点⑥）。因此不自动导入，操作方式：

```shell
# 方式一: 直接用内置列表(已按本镜像 iteminfo 过滤, 默认镜像可直接用)
docker exec dnf sh -c "mysql -h127.0.0.1 -P3306 -uroot -p'88888888' frida < /data/market_agent/restock_list_generated.sql"

# 方式二: 参照 restock_list_example.sql 按自己的 pvf 挑物品后导入
# item_catalog / item_tradable_catalog.js 可用来查询候选物品
```

改过列表/价格后执行 `python2.7 /data/market_agent/market_agent.py reset` 全量重补。

## 常用命令

```shell
# 查看做市进程状态/日志
docker exec dnf supervisorctl status dnf:market_agent
docker exec dnf tail -f /data/market_agent/market_agent.log

# 手动跑一轮(正常由整点循环自动执行)
docker exec dnf sh -c "cd /data/market_agent && python2.7 market_agent.py once"

# 改配置/补货列表后全量重补
docker exec dnf sh -c "cd /data/market_agent && python2.7 market_agent.py reset"
```

> ⚠️ **切勿执行 `market_agent.py init`**：它会 DROP 并重建 `pending_mail`，
> 清空未投递的邮件队列。容器初始化脚本已用幂等方式建好全部表结构，无需 init。
> `reset` 期间市场服务会重启加载全部挂单、期间打不开，只手动使用，别放进定时任务。

## 细节说明

* 数据库：编排脚本以 `auction_bot` 用户经 unix socket 连 MySQL；初始化脚本每次启动幂等地
  建表（只 `CREATE IF NOT EXISTS` / `INSERT IGNORE`，绝不 DROP）、播种 12 档金币寄售、
  授权 `auction_bot`。`item_catalog` 仅在缺表/为空时导入。
* 编码：镜像 `my.cnf` 的 latin1 默认字符集对原始字节透明（上游坑点⑤的解法），
  邮件文本按原始 UTF-8 字节入 `VARBINARY`，`mail_encoding` 固定 `utf-8`，**切勿改 gbk**。
* 已有部署升级：`/data` 内文件只在缺失时才生成。想让新的参考数据生效，
  删除 `/data/market_agent` 下对应文件后 `docker restart dnf` 即可重新生成。
* 上游完整文档与原理（做市策略、坑点清单、多频道细节）见
  `/data/market_agent/README.md`（即 dnf-market-agent 项目 README）。
* 上游文件按 GPL-3.0 原样集成，许可证见 `build/dnf_data/home/template/market_agent/LICENSE`。
