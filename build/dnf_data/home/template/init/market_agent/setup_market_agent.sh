#! /bin/bash

# 拍卖行/金币寄售自动做市(market_agent)初始化, 幂等, 每次启动都执行
# 1) /home/template/market_agent -> /data/market_agent: 代码/vendor 每次覆盖(随镜像升级), 配置/参考数据仅首次生成
# 2) 数据库: 建 frida 库表(幂等, 不 DROP)+播种金币寄售12档+auction_bot 授权+item_catalog 首次导入
# 注意: 不要在本脚本里跑 market_agent.py init —— 它会 DROP pending_mail, 清空未投递邮件队列

TEMPLATE_DIR=/home/template/market_agent
DATA_DIR=/data/market_agent

# ---------- 1. 文件同步 ----------
mkdir -p $DATA_DIR
# 代码与 vendor: 随镜像升级覆盖
cp -f $TEMPLATE_DIR/market_agent.py $DATA_DIR/market_agent.py
cp -f $TEMPLATE_DIR/gen_config.py $DATA_DIR/gen_config.py
rm -rf $DATA_DIR/vendor
cp -rf $TEMPLATE_DIR/vendor $DATA_DIR/vendor
# 参考数据(用户可能替换成自己 pvf 版本的), 仅首次复制
for f in item_catalog.sql restock_list_example.sql restock_list_generated.sql item_tradable_catalog.js README.md LICENSE config.json.template; do
  if [ ! -f "$DATA_DIR/$f" ];then
    cp -f $TEMPLATE_DIR/$f $DATA_DIR/$f
    echo "init market_agent $f success"
  fi
done
# 配置: 首次生成(占位符按环境变量渲染; 用 python 而非 sed, 避免密码特殊字符破坏 JSON)
if [ ! -f "$DATA_DIR/config.json" ];then
  python2.7 $TEMPLATE_DIR/gen_config.py $DATA_DIR/config.json
  echo "init market_agent config.json success"
else
  echo "market_agent config.json have already inited, do nothing!"
fi

# ---------- 2. 数据库初始化(幂等, 不 DROP 任何表) ----------
# GRANT ... IDENTIFIED BY 在 MySQL 5.0 上同时完成"建用户+设密码+授权"(无 CREATE USER IF NOT EXISTS)
# 密码中的单引号/反斜杠需转义后才能拼进 SQL 字符串
ESC_PWD=$(printf '%s' "$DNF_DB_ROOT_PASSWORD" | sed -e "s/['\\]/\\\\&/g")
SG_DB=${SERVER_GROUP_DB:-cain}

mysql -h127.0.0.1 -P3306 -uroot -p"$DNF_DB_ROOT_PASSWORD" --default-character-set=utf8 <<EOF
SET NAMES utf8;
CREATE DATABASE IF NOT EXISTS frida DEFAULT CHARSET utf8;

CREATE TABLE IF NOT EXISTS frida.pending_mail (
  id INT AUTO_INCREMENT PRIMARY KEY,
  market VARCHAR(16) NOT NULL DEFAULT 'auction',
  auction_id BIGINT DEFAULT NULL,
  occ_time DATETIME NULL,
  charac_no INT NOT NULL,
  title VARBINARY(192) NOT NULL,
  text VARBINARY(765) NOT NULL,
  gold INT NOT NULL DEFAULT 0,
  item_id INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NULL,
  claimed_by VARCHAR(40) DEFAULT NULL,
  UNIQUE KEY uniq_listing (market, auction_id, occ_time),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS frida.restock_list (
  item_id INT UNSIGNED NOT NULL PRIMARY KEY,
  cname VARCHAR(64) DEFAULT NULL,
  system_price INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  stack_size INT NOT NULL DEFAULT 1,
  upgrade TINYINT UNSIGNED DEFAULT 0,
  endurance SMALLINT UNSIGNED DEFAULT 35,
  seal_flag TINYINT UNSIGNED DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS frida.cera_consign_list (
  item_id INT UNSIGNED NOT NULL PRIMARY KEY,
  gold_label VARCHAR(32) DEFAULT NULL,
  restock_price INT NOT NULL,
  restock_qty INT NOT NULL DEFAULT 20,
  recycle_price INT NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 播种 12 档金币包(2675336-2675347, 100万~3000万), 线性 2 代币券/万金币, 与 market_agent.py 内置播种一致
INSERT IGNORE INTO frida.cera_consign_list (item_id, gold_label, restock_price, restock_qty, recycle_price, enabled) VALUES
(2675336, '100万金币', 200, 20, 200, 1),
(2675337, '200万金币', 400, 20, 400, 1),
(2675338, '300万金币', 600, 20, 600, 1),
(2675339, '400万金币', 800, 20, 800, 1),
(2675340, '500万金币', 1000, 20, 1000, 1),
(2675341, '600万金币', 1200, 20, 1200, 1),
(2675342, '700万金币', 1400, 20, 1400, 1),
(2675343, '800万金币', 1600, 20, 1600, 1),
(2675344, '900万金币', 1800, 20, 1800, 1),
(2675345, '1000万金币', 2000, 20, 2000, 1),
(2675346, '2000万金币', 4000, 20, 4000, 1),
(2675347, '3000万金币', 6000, 20, 6000, 1);

GRANT ALL PRIVILEGES ON frida.* TO 'auction_bot'@'localhost' IDENTIFIED BY '${ESC_PWD}';
GRANT ALL PRIVILEGES ON frida.* TO 'auction_bot'@'%' IDENTIFIED BY '${ESC_PWD}';
GRANT ALL PRIVILEGES ON \`taiwan_${SG_DB}_auction_gold\`.* TO 'auction_bot'@'localhost' IDENTIFIED BY '${ESC_PWD}';
GRANT ALL PRIVILEGES ON \`taiwan_${SG_DB}_auction_gold\`.* TO 'auction_bot'@'%' IDENTIFIED BY '${ESC_PWD}';
GRANT ALL PRIVILEGES ON \`taiwan_${SG_DB}_auction_cera\`.* TO 'auction_bot'@'localhost' IDENTIFIED BY '${ESC_PWD}';
GRANT ALL PRIVILEGES ON \`taiwan_${SG_DB}_auction_cera\`.* TO 'auction_bot'@'%' IDENTIFIED BY '${ESC_PWD}';
GRANT SELECT ON \`taiwan_${SG_DB}\`.* TO 'auction_bot'@'localhost' IDENTIFIED BY '${ESC_PWD}';
GRANT SELECT ON \`taiwan_${SG_DB}\`.* TO 'auction_bot'@'%' IDENTIFIED BY '${ESC_PWD}';
GRANT SELECT,INSERT,UPDATE,DELETE ON \`taiwan_${SG_DB}_2nd\`.* TO 'auction_bot'@'localhost' IDENTIFIED BY '${ESC_PWD}';
GRANT SELECT,INSERT,UPDATE,DELETE ON \`taiwan_${SG_DB}_2nd\`.* TO 'auction_bot'@'%' IDENTIFIED BY '${ESC_PWD}';
FLUSH PRIVILEGES;
EOF

# item_catalog 仅在缺表/为空时导入(约2.6万行, 自带 CREATE TABLE/SET NAMES utf8)
CNT=$(mysql -h127.0.0.1 -P3306 -uroot -p"$DNF_DB_ROOT_PASSWORD" -N -e "SELECT COUNT(*) FROM frida.item_catalog;" 2>/dev/null)
if [ -z "$CNT" ] || [ "$CNT" = "0" ];then
  echo "import market_agent item_catalog(26543 rows), take a minute..."
  mysql -h127.0.0.1 -P3306 -uroot -p"$DNF_DB_ROOT_PASSWORD" frida < $DATA_DIR/item_catalog.sql
  echo "import market_agent item_catalog success"
else
  echo "market_agent item_catalog have already inited($CNT rows), do nothing!"
fi
