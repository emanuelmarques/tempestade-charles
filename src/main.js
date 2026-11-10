import '@fontsource-variable/familjen-grotesk';
import '@fontsource-variable/martian-mono';
import './styles/app.css';
import { start } from './app.js';
import { inject } from '@vercel/analytics';

inject();
start();
