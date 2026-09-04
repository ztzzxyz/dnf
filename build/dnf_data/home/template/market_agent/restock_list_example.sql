-- ============================================================================
--  frida.restock_list(补货列表, 原 auction_whitelist) 填写示例与字段说明
--  这张表只决定: 系统补货哪些物品/补到多少/什么价.
--  回收已与本表解耦: 走 frida.item_catalog + config.json 的 recycle 规则(见 README).
--  改完用  python market_agent.py once  生效观察.
-- ============================================================================
--
--  字段逐条说明:
--  ┌─────────────┬──────────────────────────────────────────────────────────┐
--  │ item_id     │ 物品ID(主键). 必填. 补货靠它匹配 auction_main.item_id          │
--  │ cname       │ 中文名. 仅备注用(回收邮件的物品名现取自 item_catalog)            │
--  │ system_price│ 系统补货【单价】(金币/个). 按 system_price × 随机(0.8~1.2) 上架  │
--  │ quantity    │ 目标【总数量】. 材料=总个数; 装备=总件数. 系统会补齐到这个数      │
--  │ stack_size  │ 每条挂单的数量(=add_info). 材料=每堆个数(如1000); 装备固定填 1   │
--  │ upgrade     │ 强化/锻造等级. 材料填 0; 装备填想要的强化等级(0=白板)            │
--  │ endurance   │ 耐久. 材料填 0; 装备填耐久值(无所谓就用默认 35)                │
--  │ seal_flag   │ 魔法封印标志. 材料一般 0(自由交易); 装备按需(1=封印)            │
--  └─────────────┴──────────────────────────────────────────────────────────┘
--
--  关键换算(系统补货时):
--    挂单条数 = ceil(quantity / stack_size)      ← 会被建成这么多条 auction_main 记录
--    每条单价 = system_price × 随机(0.8~1.2)
--    每条一口价(instant_price) = 每条单价 × 该条的 add_info(数量)
--    这些挂单条数会按 config.json 的 rotate_every(默认10) 分摊到多个虚拟卖家 owner_id,
--    以规避"单 owner_id 上架数上限(约15)导致拍卖行打不开"的问题 —— 所以:
--      ★ stack_size 不要超过该物品在游戏里的真实可堆叠上限
--      ★ quantity/stack_size 算出的条数越多, 占用的虚拟卖家越多(每满10条换一个号), 这没问题
--
--  当前已知限制(白板装备):
--    系统上架的装备是"白板"(只带你设的 upgrade 强化等级), 不带增幅/红字/词条/徽章.
--    若要按红字/锻造/增幅分别定价, 需要扩展本表字段 + restock 的 INSERT(后续可做).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 示例一: 可堆叠材料  (stack_size 填每堆个数; upgrade/endurance/seal_flag 基本都 0)
-- ────────────────────────────────────────────────────────────────────────────

-- 无色小晶体: 单价88, 市场上常备3000个, 每堆1000 → 建 3 条挂单(每条1000个, 一口价≈88000)
INSERT INTO `frida`.`restock_list`
  (`item_id`,`cname`,`system_price`,`quantity`,`stack_size`,`upgrade`,`endurance`,`seal_flag`) VALUES
  (3037, '无色小晶体', 88, 3000, 1000, 0, 0, 0);

-- 碎布片: 单价10, 常备1200个, 每堆500 → ceil(1200/500)=3 条(500+500+200)
INSERT INTO `frida`.`restock_list`
  (`item_id`,`cname`,`system_price`,`quantity`,`stack_size`,`upgrade`,`endurance`,`seal_flag`) VALUES
  (3030, '碎布片', 10, 1200, 500, 0, 0, 0);

-- 一个"高单价材料"的写法(比如某种结晶): 单价5000, 常备50个, 每堆50 → 1 条
-- INSERT INTO `frida`.`restock_list`
--   (`item_id`,`cname`,`system_price`,`quantity`,`stack_size`,`upgrade`,`endurance`,`seal_flag`) VALUES
--   (XXXXX, '某结晶', 5000, 50, 50, 0, 0, 0);


-- ────────────────────────────────────────────────────────────────────────────
-- 示例二: 装备  (stack_size 固定填 1; quantity=想常备几件; upgrade/endurance/seal_flag 按需)
-- ────────────────────────────────────────────────────────────────────────────

-- 某武器: 单价88888, 常备3把, 每件独立(stack_size=1) → 3 条挂单; 白板(强化0), 耐久35, 封印1
INSERT INTO `frida`.`restock_list`
  (`item_id`,`cname`,`system_price`,`quantity`,`stack_size`,`upgrade`,`endurance`,`seal_flag`) VALUES
  (31056, '柯尔特 - 黑钻玄芒', 88888, 3, 1, 0, 35, 1);

-- 同一把武器想上架"+10 强化版"且只放1把: upgrade=10
-- (注意: item_id 相同会主键冲突, 一个 item_id 只能一行配置;
--  若要同物品不同强化档分别上架, 需扩展表结构, 暂不支持)
-- INSERT INTO `frida`.`restock_list`
--   (`item_id`,`cname`,`system_price`,`quantity`,`stack_size`,`upgrade`,`endurance`,`seal_flag`) VALUES
--   (31056, '柯尔特 - 黑钻玄芒+10', 888888, 1, 1, 10, 35, 1);


-- ────────────────────────────────────────────────────────────────────────────
-- 常用维护操作
-- ────────────────────────────────────────────────────────────────────────────
-- 查看补货列表:            SELECT * FROM `frida`.`restock_list`;
-- 改价(无色改成90):      UPDATE `frida`.`restock_list` SET system_price=90 WHERE item_id=3037;
-- 临时下架某物品:        DELETE FROM `frida`.`restock_list` WHERE item_id=3037;
--                        (注意: 仅停止补货, 不影响回收; 已在架的系统挂单到期后自然消失)
--
-- item_id 怎么找: 从你的物品库/iteminfo.dat 或 GM 工具查; 也可在游戏里上架一件后
--   到 taiwan_cain_auction_gold.auction_main 看它的 item_id.
