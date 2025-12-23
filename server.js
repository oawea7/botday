const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive!');
});

server.listen(8080, () => {
    console.log('Keep-alive server running on port 8080');
});
