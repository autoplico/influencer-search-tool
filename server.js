require('dotenv').config();
const path = require('path');
const express = require('express');
const influencersRouter = require('./src/routes/influencers');
const inventoryRouter = require('./src/routes/inventory');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/influencers', influencersRouter);
app.use('/api/inventory', inventoryRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`인플루언서 검색 툴이 http://localhost:${PORT} 에서 실행 중입니다.`);
});
