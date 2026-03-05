#!/usr/bin/env node
import { createApp } from './server';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(`docx-to-md web server listening on http://localhost:${PORT}`);
});
