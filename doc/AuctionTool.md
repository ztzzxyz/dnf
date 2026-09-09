# 拍卖行自动补货/回收工具

本项目集成了社区分享的 DNF 拍卖行管理工具(PyInstaller 单文件二进制, 以下简称 auction 工具)。
该工具定时扫描玩家上架物品、按概率回收低价物品、按目标数量/总价值自动补货上架,
并通过游戏邮件(postal)将回收所得金币发送给玩家, 让拍卖行看起来像一个活跃的真实市场。

## 重要限制

| 项 | 说明 |
|:---|:---|
| 镜像版本 | **仅 centos7 镜像可用**(工具为 glibc >= 2.14 的 Linux 二进制, centos5/6 镜像无法运行) |
| 默认状态 | **默认关闭**, 需设置环境变量 `AUCTION_TOOL_ENABLE=true` 开启 |
| 数据影响 | 开启后会自动购买/下架玩家拍卖品、自动上架系统商品, 属于对拍卖行数据的常态化改写, 请知悉后再开启 |
| PVF 适配 | 随镜像发布的 `items.csv` 已按默认 PVF 的 iteminfo.dat 核对清理(见下文"与原版的差异"); 若您更换了 PVF, 请自行重新调整 `items.csv` 和价格表 |

## 开启方式

docker run 增加环境变量:

```shell
docker run -d -e AUCTION_TOOL_ENABLE=true ... 1995chen/dnf:centos7-xxxx
```

docker-compose 示例:

```yaml
environment:
  - AUCTION_TOOL_ENABLE=true
```

开启后可通过 supervisor 管理页面(`PUBLIC_IP:2000`)查看 `dnf:auction_tool` 进程状态,
日志输出在 `/data/log/auction_tool.log`, 工具自身日志在 `/data/auction/auction_sync.log`。

## 文件位置

工具文件位于持久化目录 `/data/auction/`(宿主机可直接挂载修改):

```
/data/auction/
|-- auction           # 工具二进制(PyInstaller, centos7)
|-- config.yaml       # 配置文件(数据库、经济参数)
|-- items.csv         # 物品清单(item_id, name, rarity, price, seal_flag, endurance)
|-- readme.md         # 原版工具说明文档
```

配置文件中的数据库地址、账号、密码、数据库名在首次启动时自动生成
(通过容器内 3306 端口的 mysql proxy 访问大区数据库), 无需手动配置。
经济参数(手续费率、补货目标、强化等级分布、卖家心态倍率等)可自行修改,
修改后重启容器生效。

## 工作流程

工具以 `loop` 模式常驻, 每 `interval`(默认3600秒)执行一轮, 每轮流程:

1. **stop_auction**: 通过 supervisor 停止 `df_auction_r`(避免内存缓存覆盖数据库写入)
2. **init_tables**: 初始化依赖表(首次运行时自动创建, 见下文)
3. **check_and_buy_low_price**: 扫描玩家上架物品(`owner_type=0`),
   计算 `R = 玩家单价 / 标准价P_std`, 按 R 值区间概率回收:

   | R 区间 | 购买概率 |
   |:---|:---|
   | R <= 0.5 | 100% |
   | 0.5 < R < 0.9 | 1 - 0.7 x (R - 0.5) / 0.4 |
   | 0.9 <= R <= 1.1 | 50% |
   | 1.1 < R <= 1.5 | 50% x (1 - (R - 1.1) / 0.4) |
   | R > 1.5 | 0% |

4. **check_and_refill**: 按目标自动补货
   - 消耗品: 按 `consume_target_value` 总价值目标补货
   - 装备: 按 `equip_target_count[rarity]` 件数目标补货, 随机强化等级(概率分布见 config.yaml)
   - 定价受卖家心态倍率与市场饱和度影响
5. **start_auction**: 通过 supervisor 重新拉起 `df_auction_r`
6. **process_pending_mail**: 处理待发邮件, 通过 `taiwan_{大区}_2nd.postal` 表将回收金币邮寄给玩家

### 核心定价规则

| 稀有度 | 公式 |
|:---|:---|
| 蓝/白装 | `P_std(n) = A(n) x shop_price + B(n)` (n: 强化等级) |
| 紫/粉装 | `P_std(n) = P_base + BaseCost(n) x (1 + sqrt(P_base / 150000))` |
| 消耗品 | `P_std = 价格表单价` (强化等级不适用) |

## 数据库表

工具首次运行会自动创建/使用以下表(无需手动初始化):

| 数据库 | 表 | 用途 |
|:---|:---|:---|
| taiwan_{大区}_auction_gold | auction_main | 拍卖行主表(系统商品 `owner_type=1`) |
| taiwan_{大区}_auction_gold | auction_system_config | 系统卖家信息(可修改 owner_name 自定义卖家名) |
| taiwan_{大区}_auction_gold | auction_whitelist | 白名单物品 |
| frida | pending_mail | 待发送邮件队列(工具自动创建 frida 库) |
| taiwan_{大区}_2nd | postal | 游戏邮件表(回收金币通过该表发给玩家) |

自定义系统卖家名称示例:

```shell
mysql -h 127.0.0.1 -P 3306 -u game -p密码 taiwan_cain_auction_gold \
  -e "UPDATE auction_system_config SET owner_name='拍卖行' WHERE id=1;"
```

## 手动运行

除常驻 loop 模式外, 可进入容器手动执行:

```shell
# 进入容器
docker exec -it dnf bash

# 干跑一次(不改库, 输出计划)
cd /data/auction
./auction once --dry-run --seed 42

# 全量跑一次(回收 + 补货 + 发邮件)
./auction once

# 固定随机种子(可重复测试)
./auction once --seed 42

# 限制上架装备数(二分法排查)
./auction once --limit 50

# 只处理指定ID范围
./auction once --start-id 10000 --end-id 50000

# 测试模式(打印策略统计信息)
./auction --test
```

> 注意: 手动执行前建议先停止常驻进程, 避免并发写库:
> `supervisorctl -c /etc/supervisord.conf stop dnf:auction_tool`

## 价格表

`config.yaml` 中 `price_table_csv` 默认指向 `./装备和道具价格表_v2.csv`,
该文件未随镜像提供时工具会使用内置的默认价格表。
如需自定义价格, 在宿主机 `/data/auction/` 下放置该文件(UTF-8, 格式:
`序号,装备道具名称,价格(金币),备注,代码`), 然后重载:

```shell
kill -HUP $(pgrep -f "auction loop")
```

## 常见问题

| 现象 | 原因 | 解决 |
|:---|:---|:---|
| 日志提示 cannot run on this image | 非 centos7 镜像, glibc 过低 | 更换 centos7 版本镜像 |
| `auction tool is disabled` | 未开启开关 | 设置环境变量 `AUCTION_TOOL_ENABLE=true` |
| 某物品缺价格(P_std 警告) | 价格表/物品清单中缺少该物品 | 跑 `--dry-run` 查看缺价物品, 补充价格表或从 items.csv 删除 |
| 物品上架后拍卖行搜索不到 | iteminfo.dat 与 PVF 不匹配 | df_auction_r 依赖 `/home/neople/auction/iteminfo.dat` 注册可拍卖物品, 更换 PVF 时需同步更换 |
| MySQL 连接失败 | 容器内 3306 代理未就绪 | 工具下一轮会重试; 检查 `dnf:sg_mysql_proxy` 进程 |
| 修改配置不生效 | 配置仅启动时读取 | 重启容器; 价格表可通过 SIGHUP 热重载 |
| 修改了数据库密码环境变量 | config.yaml 首次启动后不再跟随环境变量 | 手动修改 `/data/auction/config.yaml` 中的 mysql.password |

## 与原版的差异

相对社区分享的原版工具(`/root/auction/` 直装), 本项目做了如下适配:

- 工具部署在持久化目录 `/data/auction/`, 配置/物品清单可在宿主机直接修改
- `df_auction_r` 的启停改由 supervisor 管理(工具通过 `supervisorctl` 重启 `dnf:auction`)
- 数据库连接/库名/密码自动适配容器环境(含大区数据库前缀), 无需手动填写
- 通过环境变量开关控制, 默认关闭, 不影响存量部署
- `items.csv` 已按镜像默认 `iteminfo.dat` 核对清理(5097 行 -> 5076 行):
  - 删除 17 个 iteminfo.dat 中不存在的物品(增幅书、增幅/扭转书设计图、强化秘药、4 把低级白武器)
  - 删除 4 个同 ID 但实际物品不同的条目(1175、33679、2600304、440338, 原表按70级版本 PVF 命名, 与默认 PVF 漂移, 会导致价格错位)
  - 保留 `27653 佩刀` 的 white/blue 双条目(同一物品挂两个定价档位, 属原版有意设计)
  - 其余 ~50 处名称差异为简繁体/译名风格差异, 仅影响日志显示, 无需处理

> 若您使用的 PVF 与默认 PVF 不同, 建议参照上述方法以自己的 `iteminfo.dat` 为准重新核对 `/data/auction/items.csv`。
