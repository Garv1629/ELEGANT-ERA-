const http = require('http');

function postInquiry(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/inquiries',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getStatus() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000/api/inquiries', res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- TEST 1: Initial status ---');
  console.log(await getStatus());

  console.log('--- TEST 2: Valid inquiry ---');
  const res1 = await postInquiry({
    name: 'Aarav Mehta',
    phone: '9876543210',
    email: 'aarav@example.com',
    projectType: '3 BHK Apartment',
    message: 'Looking for living room and modular kitchen design in Noida Extension',
    source: 'test-suite'
  });
  console.log(res1);

  console.log('--- TEST 3: Duplicate protection check ---');
  const resDup = await postInquiry({
    name: 'Aarav Mehta',
    phone: '9876543210',
    email: 'aarav@example.com',
    projectType: '3 BHK Apartment'
  });
  console.log(resDup);

  console.log('--- TEST 4: Invalid phone check ---');
  const resInvalid = await postInquiry({
    name: 'John Doe',
    phone: '123'
  });
  console.log(resInvalid);

  console.log('--- TEST 5: Final status & persistence ---');
  console.log(await getStatus());
}

run().catch(console.error);
