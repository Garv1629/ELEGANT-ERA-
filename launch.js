const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const out = fs.openSync(path.join(__dirname, 'server.log'), 'a');
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  detached: true,
  stdio: ['ignore', out, out]
});
child.unref();
console.log('Server spawned with PID:', child.pid);
