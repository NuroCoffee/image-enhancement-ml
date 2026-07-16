import './styles.css';
import { ImageEnhancer } from './api/ImageEnhancer';
import { App } from './ui/App';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Root element #app was not found.');

const enhancer = new ImageEnhancer({
  modelBaseUrl: new URL('model/', document.baseURI).href,
});

const app = new App(root, enhancer);
app.mount();

window.addEventListener('beforeunload', () => {
  app.dispose();
  enhancer.dispose();
});
