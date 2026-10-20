// Punto de entrada para Vercel. Vercel busca un archivo en la raíz que importe "express"
// y usa su exportación por defecto como servidor. La API real está en server/index.js.
import express from 'express'; // eslint-disable-line no-unused-vars
import app from './server/index.js';

export default app;
