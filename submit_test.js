const http = require('http');
const fs = require('fs');
const path = require('path');

const payload = JSON.stringify({
  name: 'Aarav Mehta',
  phone: '9876543210',
  email: 'aarav.mehta@example.com',
  projectType: '3 BHK Apartment',
  message: 'Seeking turnkey modular kitchen & living room design in Noida Extension',
  source: 'cross-device-verification'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/inquiries',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const result = {
      statusCode: res.statusCode,
      response: JSON.parse(body)
    };
    fs.writeFileSync(path.join(__dirname, 'data/test_result.json'), JSON.stringify(result, null, 2));
    console.log('Result written:', result);
  });
});

req.on('error', err => {
  console.error('Request error:', err);
  process.exit(1);
});

req.write(payload);
req.end();
