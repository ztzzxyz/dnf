# /bin/bash

killall -9 df_monitor_r
rm -rf pid/*.pid
# 注意: 必须使用nofork模式前台启动(start模式会在Init_Daemon中fork守护进程,父进程退出,
# 导致stdout块缓冲永不刷新, monitor的输出[on_load/等待触发等]全部看不到).
# stdbuf -oL -eL 将stdout/stderr设为行缓冲, 使日志实时写入monitor.log
# LD_PRELOAD放在stdbuf之前(stdbuf会保留并前置libstdbuf.so), stdbuf -oL -eL 行缓冲使日志实时写入monitor.log
LD_PRELOAD="/home/template/init/libhook.so:/home/neople/monitor/libfd_monitor.so" stdbuf -oL -eL ./df_monitor_r server nofork
sleep 2
cat pid/*.pid |xargs -n1 -I{} tail --pid={} -f /dev/null
