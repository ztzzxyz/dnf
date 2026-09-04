#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""渲染 market_agent 的 config.json(容器初始化用).

读取本目录下 config.json.template, 用环境变量替换占位符后输出为合法 JSON:
  __DNF_DB_GAME_PASSWORD__  <- $DNF_DB_GAME_PASSWORD (默认 uu5!^%jg, 与 Dockerfile 一致)
  __SERVER_GROUP_DB__       <- $SERVER_GROUP_DB      (默认 cain, 与 docker-entrypoint.sh 一致)

用法: python gen_config.py <输出路径>
用 python 生成而非 sed, 是为了正确处理密码中的引号/反斜杠等 JSON 转义.
复用 game 库用户(与游戏服/frida.js 同一账号, 已有 ALL ON *.* 权限), 不另建专用账号.
"""
import io
import json
import os
import sys

TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json.template")


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("usage: python gen_config.py <output_path>\n")
        return 1
    out_path = sys.argv[1]

    with io.open(TEMPLATE, "r", encoding="utf-8") as f:
        cfg = json.loads(f.read())

    game_pwd = os.environ.get("DNF_DB_GAME_PASSWORD") or "uu5!^%jg"
    sg_db = os.environ.get("SERVER_GROUP_DB") or "cain"

    cfg["mysql"]["password"] = game_pwd
    cfg["system_owner"]["special"]["charac_db"] = "taiwan_%s" % sg_db
    cfg["system_owner"]["special"]["game_db"] = "taiwan_%s_2nd" % sg_db
    cfg["markets"]["auction"]["db"] = "taiwan_%s_auction_gold" % sg_db
    cfg["markets"]["cera"]["db"] = "taiwan_%s_auction_cera" % sg_db

    with io.open(out_path, "w", encoding="utf-8") as f:
        f.write(json.dumps(cfg, ensure_ascii=False, indent=2, sort_keys=False))
        f.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
