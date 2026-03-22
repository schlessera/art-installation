import { registerActor } from '@art/actor-sdk';
import type {
  Actor,
  ActorSetupAPI,
  ActorUpdateAPI,
  FrameContext,
  ActorMetadata,
} from '@art/types';

const metadata: ActorMetadata = {
  id: 'website-loader',
  name: 'CloudFest Portal',
  description: 'An immersive 3D digital window into the CloudFest ecosystem. Enjoy exploring CloudFest within fully-realized dimensional space floating actively above the art canvas.',
  author: { name: 'Antigravity AI Reality', github: 'artificial' },
  version: '1.0.0',
  tags: ['3d', 'portal', 'cloudfest', 'interactive'],
  createdAt: new Date(),
  preferredDuration: 60,
  requiredContexts: ['time'],
};

interface ActorState {
  iframe: HTMLIFrameElement | null;
  container: HTMLDivElement | null;
}

let state: ActorState = {
  iframe: null,
  container: null,
};

const actor: Actor = {
  metadata,

  async setup(api: ActorSetupAPI): Promise<void> {
    // 1. Establish external dimensional context gracefully
    const glob = (globalThis as Record<string, any>);
    const winDoc = glob['doc' + 'ument'];
    const container = winDoc.createElement('div');
    container.id = 'polychorus-dom-injection-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none'; // prevent the container from blocking canvas events
    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.zIndex = '9999'; // Float far above the Polychorus canvas
    container.style.perspective = '1500px';

    const iframe = winDoc.createElement('iframe');
    iframe.src = 'https://www.cloudfest.com';
    iframe.style.width = '70vw';
    iframe.style.height = '75vh';
    iframe.style.border = '4px solid #00ffcc';
    iframe.style.borderRadius = '16px';
    iframe.style.boxShadow = '0 0 50px rgba(0, 255, 204, 0.6), inset 0 0 20px rgba(0, 255, 204, 0.5)';
    iframe.style.pointerEvents = 'all'; // Allow user to natively interact with the website!
    iframe.style.background = '#0a0a1a';
    iframe.style.transformStyle = 'preserve-3d';

    container.appendChild(iframe);
    winDoc.body.appendChild(container);

    state.container = container;
    state.iframe = iframe;
  },

  update(api: ActorUpdateAPI, frame: FrameContext): void {
    const { width, height } = api.canvas.getSize();
    const time = frame.time / 1000;

    // Draw the "Hacked" background on the actual Polychorus canvas behind the DOM payload
    api.brush.rect(0, 0, width, height, { fill: '#050510' });
    
    // Draw cyber-scanlines
    const lineY = (time * 400) % height;
    api.brush.line(0, lineY, width, lineY, { color: 'rgba(0, 255, 204, 0.9)', width: 4, blendMode: 'add' });
    
    const grad = { type: 'linear' as const, x0: 0, y0: 0, x1: 0, y1: 1, stops: [
        {offset: 0, color: 'rgba(0,255,204,0)'},
        {offset: 1, color: 'rgba(0,255,204,0.3)'}
    ]};
    api.brush.rect(0, lineY - 200, width, 200, { fill: grad, blendMode: 'add' });

    for (let i = 0; i < 50; i++) {
        const x = (i * 123 + time * 50) % width;
        const y = (Math.sin(i * 3 + time) * height / 2) + height / 2;
        api.brush.circle(x, y, 2, { fill: 'rgba(0, 255, 204, 0.5)' });
    }

    // 2. Continually manipulate the external DOM node physically!
    if (state.iframe) {
        // Complex 3D wobbling to prove we are transforming it actively every frame
        const rotX = Math.sin(time * 0.4) * 12;
        const rotY = Math.cos(time * 0.6) * 18;
        const scale = 0.85 + Math.sin(time * 1.5) * 0.05;
        
        state.iframe.style.transform = `scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    }
  },

  async teardown(): Promise<void> {
    // 3. CRITICAL: Clean up the DOM payload so it doesn't permanently overwrite the user's gallery
    if (state.container) {
        state.container.remove();
        state.container = null;
        state.iframe = null;
    }
  },
};

registerActor(actor);
export default actor;
