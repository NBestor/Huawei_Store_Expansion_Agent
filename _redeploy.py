import paramiko, os, tarfile, time

HOST = '47.97.59.219'
USER = 'root'
PASSWORD = 'Deepseek_V4'
REMOTE_DIR = '/root/huawei-pc-agent'
LOCAL_ROOT = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {'.git', '__MACOSX', '.history', 'node_modules', '.DS_Store', '.runtime', '.pnpm-store'}
SKIP_FILES = {'.DS_Store'}

def make_tarball(path):
    with tarfile.open(path, 'w:gz') as tar:
        for name in ['app', 'package.json']:
            full = os.path.join(LOCAL_ROOT, name)
            if os.path.isdir(full):
                for root, dirs, files in os.walk(full):
                    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                    for f in files:
                        if f in SKIP_FILES: continue
                        tar.add(os.path.join(root, f), arcname=os.path.relpath(os.path.join(root, f), LOCAL_ROOT).replace('\\', '/'))
            else:
                tar.add(full, arcname=name)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, port=22, username=USER, password=PASSWORD, timeout=20)
print('SSH 连接成功\n')

def run(cmd, timeout=300):
    print('$', cmd)
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    print(stdout.read().decode('utf-8', 'replace'))
    err = stderr.read().decode('utf-8', 'replace')
    if err.strip(): print('[stderr]', err)

tar_path = os.path.join(LOCAL_ROOT, '_redeploy.tar.gz')
make_tarball(tar_path)
print('压缩包: %.2f MB' % (os.path.getsize(tar_path)/1e6))
sftp = ssh.open_sftp(); sftp.put(tar_path, '/root/_redeploy.tar.gz'); sftp.close()
print('上传完成\n')

run("pkill -f 'node app/server.mjs' || echo '无运行中服务'")
time.sleep(1)
run(f'tar -xzf /root/_redeploy.tar.gz -C {REMOTE_DIR}')
run(f'cd {REMOTE_DIR} && nohup node app/server.mjs > app.log 2>&1 </dev/null &')
time.sleep(5)
run(f'cd {REMOTE_DIR} && tail -5 app.log')
run('curl -s -o /dev/null -w "status=%{http_code}\\n" http://127.0.0.1:3000/api/status')
run('rm -f /root/_redeploy.tar.gz')
os.remove(tar_path)
ssh.close()
print('\n===== 部署完成 =====')
