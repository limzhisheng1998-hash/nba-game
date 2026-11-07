import './style.css';
import { showMainMenu } from './ui/ui';

// Block iOS pinch-zoom. Double-tap zoom is already disabled by `touch-action` in CSS.
document.addEventListener('gesturestart', (e) => e.preventDefault());

showMainMenu();
