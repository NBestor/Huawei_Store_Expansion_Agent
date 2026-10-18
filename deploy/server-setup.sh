#!/usr/bin/env bash
# 阿里云 ECS 服务器初始化脚本（在服务器上以 root 执行）
# 用法：bash server-setup.sh
set -e

APP_DIR=/root/huawei-pc-agent

echo "==> 1/3 检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "    未检测到 Node，正在安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

echo "==> 2/3 检查项目目录"
if [ ! -f "$APP_DIR/app/server.mjs" ]; then
  echo "    未找到 $APP_DIR/app/server.mjs，请先上传项目文件。"
  exit 1
fi

echo "==> 3/3 检查 .env"
if [ ! -f "$APP_DIR/.env" ]; then
  echo "    未找到 .env，请在 $APP_DIR 下手动创建（模板见 部署说明.md）。"
  exit 1
fi

echo "==> 启动服务"
cd "$APP_DIR"
nohup node app/server.mjs > app.log 2>&1 &
echo "    已启动，日志：$APP_DIR/app.log"
echo "    访问：http://$(hostname -I | awk '{print $1}'):3000"
