import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/app.css';
import { start } from './app.js';
import { inject } from '@vercel/analytics';

inject();
start();
