# /bin/bash

# 拍卖行自动补货/回收工具(df_auction_r 辅助工具, 默认关闭)
# 通过环境变量 AUCTION_TOOL_ENABLE=true 开启
# 详细文档参见 doc/AuctionTool.md

# 检查开关
if [ "$AUCTION_TOOL_ENABLE" != "true" ];then
  echo "auction tool is disabled, set AUCTION_TOOL_ENABLE=true to enable it"
  sleep 5
  exit 0
fi

# 检查工具是否初始化
if [ ! -f "/data/auction/auction" ] || [ ! -f "/data/auction/config.yaml" ];then
  echo "auction tool not ready: /data/auction not initialized"
  sleep 5
  exit 0
fi

# 检查glibc版本(工具为PyInstaller打包的Linux二进制, 需要glibc >= 2.14, 即centos7镜像)
glibc_version=$(ldd --version 2>/dev/null | head -1 | grep -o '[0-9]\+\.[0-9]\+' | head -1)
glibc_major=$(echo "$glibc_version" | cut -d. -f1)
glibc_minor=$(echo "$glibc_version" | cut -d. -f2)
if [ -z "$glibc_major" ] || [ "$glibc_major" -lt 2 ] || { [ "$glibc_major" -eq 2 ] && [ "$glibc_minor" -lt 14 ]; };then
  echo "auction tool requires glibc >= 2.14 (centos7 image), current glibc: ${glibc_version:-unknown}"
  sleep 5
  exit 0
fi

cd /data/auction
chmod 755 ./auction

# 检查二进制可执行
if ! ./auction --help >/dev/null 2>&1;then
  echo "auction tool binary check failed:"
  ./auction --help
  sleep 5
  exit 0
fi

echo "starting auction tool..."
# 前台常驻运行, supervisor 负责守护
exec ./auction loop
