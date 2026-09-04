#! /bin/bash

# 拍卖行/金币寄售自动做市循环: 每整点(+10s 偏移)跑一轮 market_agent.py once
# 由 supervisor 托管(program: market_agent, 组 dnf), 停/启拍卖行/金币寄售由 market_agent.py 内部调 supervisorctl 完成
# 每轮日志: /data/market_agent/market_agent.log(脚本自身写) + supervisor stdout(dnf:market_agent 的 Tail -f 可看)

DATA_DIR=/data/market_agent
PYTHON=python2.7

echo "market_agent_loop start, waiting next hour boundary..."
while true; do
  # 对齐到下一个整点 +10 秒(整点先广播提醒, 随后停服做市)
  now=$(date +%s)
  next=$(( (now / 3600 + 1) * 3600 + 10 ))
  sleep $(( next - now ))
  cd $DATA_DIR || { echo "cd $DATA_DIR failed"; continue; }
  $PYTHON $DATA_DIR/market_agent.py once 2>&1
done
