# DNF 拍卖行自动补货 + 回收工具

DNF 单机版拍卖行管理工具。定时扫描玩家低价上架物品按概率回收，按目标总价值 / 件数自动补货上架，强化装备按强化公式定价。

## 文件结构

```
auction/                              # 项目根 (部署后 = /root/auction/)
|-- items.csv                         # 物品清单
|-- 装备和道具价格表_v2.csv              # 价格表 (5097 行, UTF-8)
|-- 70版本价格对比结果.csv               # 70 版本价格参考
|-- readme.md                         # 本文件
|-- start.sh                          # df_auction_r 启动脚本
|-- stop.sh                           # df_auction_r 停止脚本
|-- docs/
|   |-- deployment.md                 # 详细部署手册
|-- src/
|   |-- auction_sync.py               # 主入口
|   |-- pricing.py                    # P_std 标准价计算
|   |-- strategy.py                   # 回收/补货概率与分布
|   |-- economy_models.py             # 概率工具
|   |-- price_table.py                # 价格表加载
|   |-- config.yaml                   # 配置文件
|   |-- build.sh                      # PyInstaller 打包脚本
|   |-- requirements.txt              # Python 依赖
|-- tests/
    |-- test_smoke.py                 # 25+ 单元测试 (不需数据库)
```

## 环境要求

| 项 | 最低要求 | 备注 |
|:---|:---|:---|
| OS | CentOS 7.6 / RHEL 7.6 | glibc 2.17 |
| 架构 | x86_64 | |
| 网络 | 可访问 MySQL | 默认 192.168.200.131:3306 |
| Python (打包用) | 3.6+ | 运行时不需要, 产物是 PyInstaller 单文件 |
| 系统工具 (打包用) | gcc, make, openssl-devel, libffi-devel, zlib-devel | 编译 PyInstaller 依赖需要 |
| 磁盘 | >= 1 GB | Python 依赖 + 打包产物 |

## 打包

**必须在目标服务器 (同 glibc 版本) 上打包**，产物 `auction` 是单文件二进制，已内置 Python 解释器。

```bash
# 安装依赖
cd /root/auction/src
pip3 install -r requirements.txt pyinstaller

# 打包
bash build.sh
# 产物: src/dist/auction (~7MB ELF Linux binary)
```

打包脚本 `build.sh` 会:

- `--onefile` : 单文件输出
- `--add-data` : 把 config.yaml / items.csv / 价格表内嵌 (兜底)
- `--hidden-import` : 显式声明 pymysql / yaml / csv

> **关键约束**: 必须和运行服务器同 glibc 版本。CentOS 7.6 打包 -> CentOS 7.6 运行。

## 测试

### 单元测试 (不需数据库)

```bash
cd /root/auction
python3 tests/test_smoke.py
# 25+ 个测试: 模块导入、常量、邮件构造、价格表加载、CSV 格式、强化公式等
```

或加详细输出:

```bash
python3 -m pytest tests/test_smoke.py -v   # 需要 pip install pytest
```

### Dry-run (不改库, 验证逻辑)

```bash
cd /root/auction
./auction once --dry-run --seed 42
```

期望输出 (关键行):

```
[INFO] 加载价格表: /root/auction/装备和道具价格表_v2.csv
[INFO] 装备补货: 共 3486 个
[INFO] 共生成 34785 条补货计划
[INFO] === 同步完成 ===
```

耗时 < 5 秒。**不会改任何数据库**，只输出计划。

### 真实运行一次 (会写库)

```bash
cd /root/auction
./auction once               # 全量
./auction once --seed 42     # 固定随机种子 (可重复测试)
```

## 单次运行

| 命令 | 说明 |
|:---|:---|
| `./auction once` | 全量跑一次 (回收 + 补货 + 发邮件) |
| `./auction once --dry-run` | 干跑, 不改库 |
| `./auction once --seed 42` | 固定随机种子 |
| `./auction once --dry-run --seed 42` | 干跑 + 固定种子 (推荐测试) |
| `./auction once --limit 50` | 限制上架装备数 (二分法排查用) |
| `./auction once --start-id 10000 --end-id 50000` | 只处理指定 ID 范围 |
| `./auction --test` | 测试模式 (打印策略统计信息) |

## 常驻运行

`./auction loop` 按 `config.yaml` 中 `interval` 秒数循环执行。

### 方式一: systemd (推荐, 开机自启)

创建服务文件:

```bash
cat > /etc/systemd/system/auction.service << 'EOF'
[Unit]
Description=DNF Auction Auto-Restock
After=mysql.service network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/auction
ExecStart=/root/auction/auction loop
Restart=always
RestartSec=30
StandardOutput=append:/root/auction/log/stdout.log
StandardError=append:/root/auction/log/stderr.log

[Install]
WantedBy=multi-user.target
EOF
```

启用并启动:

```bash
systemctl daemon-reload
systemctl enable auction          # 开机自启
systemctl start auction           # 立即启动
systemctl status auction          # 查看状态
```

日常管理:

```bash
systemctl stop auction            # 停止
systemctl start auction           # 启动
systemctl restart auction         # 重启
systemctl reload auction          # 重载价格表 (SIGHUP)
journalctl -u auction -f          # 实时日志
```

### 方式二: nohup (临时测试)

```bash
cd /root/auction
nohup ./auction loop > /dev/null 2>&1 &
echo $! > /tmp/auction.pid

# 停止
kill -TERM $(cat /tmp/auction.pid)

# 重载价格表
kill -HUP $(cat /tmp/auction.pid)
```

不推荐 (不会开机自启)。

> 如果忘了存 PID 文件，用 `pgrep -f "auction loop"` 或 `ps aux | grep auction` 找回。

## 更新部署流程

改完代码后的标准更新流程:

```bash
# 1. 备份当前版本
cd /root/auction
cp auction auction.bak.$(date +%s)

# 2. 停止服务
systemctl stop auction

# 3. 重新打包 (服务器上)
cd /root/auction/src
bash build.sh

# 4. 替换二进制
cp dist/auction /root/auction/auction
chmod +x /root/auction/auction

# 5. 干跑验证
cd /root/auction
./auction once --dry-run --seed 42
# 确认输出无异常

# 6. 重新常驻
systemctl start auction
systemctl status auction
```

### 仅更新数据文件 (价格表 / items.csv)

不需要重新打包，直接替换文件后重载:

```bash
# 1. 替换文件
cp 新价格表.csv /root/auction/装备和道具价格表_v2.csv

# 2. 重载 (两种方式)
systemctl reload auction
# 或
kill -HUP $(pgrep -f "auction loop")
```

## 核心定价规则

### 装备标准价 P_std

| 稀有度 | 公式 |
|:---|:---|
| 蓝/白 | `P_std(n) = A(n) x shop_price + B(n)` (n: 强化等级) |
| 紫/粉 | `P_std(n) = P_base + BaseCost(n) x (1 + sqrt(P_base / 150000))` |
| 消耗品 | `P_std = 价格表单价` (强化等级不适用) |

### 回收策略

- 扫描玩家上架物品 (`owner_type = 0`)
- 计算 `R = 玩家单价 / P_std(n)`，其中 `n` 为物品实际强化等级
- 按 R 值区间决定购买概率:

| R 区间 | 购买概率 |
|:---|:---|
| R <= 0.5 | 100% |
| 0.5 < R < 0.9 | 1 - 0.7 x (R - 0.5) / 0.4 |
| 0.9 <= R <= 1.1 | 50% |
| 1.1 < R <= 1.5 | 50% x (1 - (R - 1.1) / 0.4) |
| R > 1.5 | 0% |

### 补货策略

- **消耗品**: 按 `consume_target_value` 总价值目标补货
- **装备**: 按 `equip_target_count[rarity]` 件数目标补货，随机强化等级 (概率分布见 `config.yaml`)
- 定价受卖家心智倍率 + 市场饱和度影响

## 配置参考

`config.yaml` 关键字段:

```yaml
interval: 3600                     # 循环间隔 (秒)

mysql:
  host: 192.168.200.131
  port: 3306
  user: game
  password: "uu5!^%jg"

auction:
  stop_cmd: bash /root/auction/stop.sh
  start_cmd: bash /root/auction/start.sh
  work_dir: /root/auction

economy:
  price_table_csv: ./装备和道具价格表_v2.csv
  insert_to_auction: true
  fee_rate: 0.03
  deposit: 10000
  consume_target_value: 100000000
```

完整配置项见 `src/config.yaml`。

## 速查卡

```bash
# === 测试 ===
python3 tests/test_smoke.py                      # 单元测试
./auction once --dry-run --seed 42               # 干跑测试
./auction --test                                 # 策略统计

# === 单次运行 ===
./auction once                                   # 全量跑一次
./auction once --seed 42                         # 固定种子

# === 常驻 ===
systemctl start auction                          # 启动
systemctl stop auction                           # 停止
systemctl restart auction                        # 重启
systemctl reload auction                         # 重载价格表
systemctl status auction                         # 状态
journalctl -u auction -f                         # 实时日志

# === 日志 ===
tail -f /root/auction/auction_sync.log           # 应用日志
tail -f /root/auction/log/stderr.log             # systemd 标准错误

# === 进程 ===
ps aux | grep auction | grep -v grep
pgrep -af auction
cat /tmp/auction.pid                              # nohup 保存的 PID
pgrep -f "auction loop"                           # 查 nohup 进程 ID

# === 数据库查询 ===
mysql -h 192.168.200.131 -u game -p
USE taiwan_cain_auction_gold;
SELECT COUNT(*) FROM auction_main WHERE owner_type = 1;
SELECT COUNT(*), AVG(upgrade) FROM auction_main WHERE owner_type = 1;
USE frida;
SELECT COUNT(*) FROM pending_mail WHERE status = 0;

# === 打包 ===
cd /root/auction/src && bash build.sh
ls -lh dist/auction

# === 升级 ===
systemctl stop auction
cd /root/auction/src && bash build.sh
cp dist/auction /root/auction/auction
chmod +x /root/auction/auction
./auction once --dry-run --seed 42
systemctl start auction
```

## 故障排查

| 现象 | 原因 | 解决 |
|:---|:---|:---|
| `cannot execute binary file` | glibc 版本不兼容 | 在目标服务器同版本 Linux 上重新打包 |
| `加载价格表: 文件不存在` | 路径错误 | 检查 config.yaml 中 price_table_csv 路径 |
| `config.yaml 找不到` | 未在同一目录 | auction 二进制必须和 config.yaml 同目录 |
| `MySQL 连接失败` | 网络/密码错误 | `mysql -h IP -u user -p` 测试连通性 |
| `df_auction_r 启停失败` | work_dir 路径错误 | 确认 start.sh/stop.sh 路径与 config.yaml 一致 |
| systemd 起不来 | ExecStart 路径错误 | `journalctl -u auction -xe` 看详细错误 |
| 价格表改了不生效 | SIGHUP 未触发 | `systemctl reload auction` 然后看日志 |
| 某物品缺价格 | CSV 中 ID 缺失 | 跑 `--dry-run` 看 "缺 P_std" 警告 |
