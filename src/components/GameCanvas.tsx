import React, { useEffect, useRef, useState } from 'react';
import { HandTracker, HandData } from '../lib/handTracking';
import { motion, AnimatePresence } from 'motion/react';

interface GameState {
  score: number;
  health: number;
  gameStatus: 'idle' | 'playing' | 'gameOver';
}

const ASCII_BRIGHTNESS = "  ..++**##%%@@";

export const GameCanvas: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    health: 100,
    gameStatus: 'idle'
  });

  const [isHandVisible, setIsHandVisible] = useState(false);
  const isHandVisibleRef = useRef(false);

  const gameStatusRef = useRef<'idle' | 'playing' | 'gameOver'>('idle');
  const lastHandData = useRef<HandData | null>(null);

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      gameStatusRef.current = 'idle';
    };
  }, []);
  const entities = useRef<{
    player: { x: number, y: number, lastHitTime: number },
    bullets: { x: number, y: number, id: number }[],
    enemies: { x: number, y: number, type: 'stalker' | 'drone', health: number, id: number }[],
    particles: { x: number, y: number, vx: number, vy: number, life: number, char: string }[]
  }>({
    player: { x: 0.5, y: 0.8, lastHitTime: 0 },
    bullets: [],
    enemies: [],
    particles: []
  });

  const frameCount = useRef(0);
  const lastShotTime = useRef(0);

  const startGame = async () => {
    if (videoRef.current) {
      if (!trackerRef.current) {
        trackerRef.current = new HandTracker(videoRef.current, (data) => {
          lastHandData.current = data;
          
          const visible = !!data;
          if (visible !== isHandVisibleRef.current) {
            isHandVisibleRef.current = visible;
            setIsHandVisible(visible);
          }
        });
      }
      await trackerRef.current.start();
      gameStatusRef.current = 'playing';
      setGameState({ score: 0, health: 100, gameStatus: 'playing' });
      requestAnimationFrame(gameLoop);
    }
  };

  const gameLoop = (time: number) => {
    if (gameStatusRef.current !== 'playing') return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    frameCount.current++;

    // 1. Update Game Logic
    updateLogic(time);

    // 2. Render Dithered Feed
    renderBackground(ctx, video);

    // 3. Render Entities
    renderEntities(ctx);

    // 4. Collision Detection
    checkCollisions();

    requestAnimationFrame(gameLoop);
  };

  const updateLogic = (time: number) => {
    const data = lastHandData.current;
    if (data) {
      // Smooth movement
      entities.current.player.x += (data.x - entities.current.player.x) * 0.2;
      entities.current.player.y += (data.y - entities.current.player.y) * 0.2;

      // Shooting
      if (data.isPinching && time - lastShotTime.current > 150) {
        entities.current.bullets.push({ 
          x: entities.current.player.x, 
          y: entities.current.player.y - 0.05,
          id: Math.random() 
        });
        lastShotTime.current = time;
      }
    }

    // Move bullets
    entities.current.bullets = entities.current.bullets.filter(b => {
      b.y -= 0.02;
      return b.y > -0.1;
    });

    // Spawn enemies
    if (frameCount.current % 60 === 0) {
      entities.current.enemies.push({
        x: Math.random(),
        y: -0.1,
        type: Math.random() > 0.3 ? 'drone' : 'stalker',
        health: 1,
        id: Math.random()
      });
    }

    // Move enemies
    entities.current.enemies.forEach(e => {
      e.y += 0.005;
    });
    entities.current.enemies = entities.current.enemies.filter(e => e.y < 1.1);

    // Move particles
    entities.current.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    entities.current.particles = entities.current.particles.filter(p => p.life > 0);
  };

  const renderBackground = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    // Draw raw video to small buffer for dithering (16:9 ratio)
    const smallW = 192;
    const smallH = 108;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Center-crop the video to avoid skewing (Object-fit: cover logic)
    const videoAspect = video.videoWidth / video.videoHeight || 4/3;
    const targetAspect = smallW / smallH;
    let sWidth = video.videoWidth;
    let sHeight = video.videoHeight;
    let sx = 0;
    let sy = 0;

    if (videoAspect > targetAspect) {
      sWidth = video.videoHeight * targetAspect;
      sx = (video.videoWidth - sWidth) / 2;
    } else {
      sHeight = video.videoWidth / targetAspect;
      sy = (video.videoHeight - sHeight) / 2;
    }

    tempCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, smallW, smallH);
    const imgData = tempCtx.getImageData(0, 0, smallW, smallH);
    const data = imgData.data;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const cellSizeW = w / smallW;
    const cellSizeH = h / smallH;

    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < smallH; y += 2) {
      for (let x = 0; x < smallW; x += 2) {
        const idx = (y * smallW + (smallW - x - 1)) * 4; // Flip X for mirror
        let r = data[idx];
        let g = data[idx + 1];
        let b = data[idx + 2];
        
        // Boost contrast and brightness
        const brightness = (r + g + b) / 3;
        const contrastFactor = 1.4; // More contrast
        const brightnessBias = 25; // Base brightness boost
        
        r = Math.min(255, r * contrastFactor + brightnessBias);
        g = Math.min(255, g * contrastFactor + brightnessBias);
        b = Math.min(255, b * contrastFactor + brightnessBias);
        const adjustedBrightness = (r + g + b) / 3;

        if (adjustedBrightness > 15) { // Lower threshold for more detail in shadows
          const char = ASCII_BRIGHTNESS[Math.floor((adjustedBrightness / 255) * (ASCII_BRIGHTNESS.length - 1))];
          // Increase alpha for better visibility
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, (adjustedBrightness / 255) * 0.8)})`; 
          ctx.fillText(char, x * cellSizeW, y * cellSizeH);
        }
      }
    }
  };

  const renderEntities = (ctx: CanvasRenderingContext2D) => {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    // Player - White by default, Pink when hit
    const isHit = Date.now() - entities.current.player.lastHitTime < 150;
    ctx.fillStyle = isHit ? '#ec4899' : '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    
    const px = entities.current.player.x * w;
    const py = entities.current.player.y * h;
    
    ctx.fillText('  /\\  ', px, py);
    ctx.fillText('v--v', px, py + 15);

    // Bullets - Dot or exclamation from reference
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    entities.current.bullets.forEach(b => {
      ctx.fillText('!', b.x * w, b.y * h);
    });

    // Enemies - Accurate ASCII signs from the reference image
    entities.current.enemies.forEach(e => {
      const ex = e.x * w;
      const ey = e.y * h;
      
      if (e.type === 'drone') {
        // Red Stalker variant
        ctx.fillStyle = '#ef4444';
        ctx.fillText('(---)', ex, ey);
      } else {
        // Blue Defender variant
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('(w)', ex, ey);
      }
    });

    // Particles
    entities.current.particles.forEach(p => {
      ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
      ctx.font = '10px monospace';
      ctx.fillText(p.char, p.x * w, p.y * h);
    });
    
    // Bottom border - Complex sequence from reference
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '14px monospace';
    const borderText = '////|/\\|/\\|VII//|\\\\/I//\\|V/||V/\\\\/\\|\\|\\/-I--///////||\\\\ :`-`|/\\/`  `\\\\\\//\\-||//||/\\-V-/|/\\/||||||//||\\/\\||';
    ctx.fillText(borderText, w / 2, h - 15);
  };

  const checkCollisions = () => {
    const { bullets, enemies, player } = entities.current;

    // Bullets vs Enemies
    bullets.forEach((b, bi) => {
      enemies.forEach((e, ei) => {
        const dx = Math.abs(b.x - e.x);
        const dy = Math.abs(b.y - e.y);
        if (dx < 0.05 && dy < 0.05) {
          // Hit!
          bullets.splice(bi, 1);
          enemies.splice(ei, 1);
          setGameState(prev => ({ ...prev, score: prev.score + 10 }));
          
          // Explosion particles
          for (let i = 0; i < 5; i++) {
            entities.current.particles.push({
              x: e.x, y: e.y,
              vx: (Math.random() - 0.5) * 0.01,
              vy: (Math.random() - 0.5) * 0.01,
              life: 1.0,
              char: '+*@'[Math.floor(Math.random() * 3)]
            });
          }
        }
      });
    });

    // Player vs Enemies
    enemies.forEach((e, ei) => {
      const dx = Math.abs(player.x - e.x);
      const dy = Math.abs(player.y - e.y);
      if (dx < 0.06 && dy < 0.06) {
        enemies.splice(ei, 1);
        entities.current.player.lastHitTime = Date.now();
        setGameState(prev => {
          const newHealth = prev.health - 20;
          if (newHealth <= 0) {
             gameStatusRef.current = 'gameOver';
             return { ...prev, health: 0, gameStatus: 'gameOver' };
          }
          return { ...prev, health: newHealth };
        });
      }
    });
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden font-mono">
      {/* Hidden processing video */}
      <video ref={videoRef} className="hidden" playsInline muted />
      
      {/* Main Game Screen */}
      <div className="relative w-full max-w-5xl aspect-video border-4 border-[#222] shadow-[0_0_50px_rgba(255,255,255,0.05)] ring-1 ring-[#333]">
        <canvas ref={canvasRef} width={1024} height={576} className="w-full h-full block bg-[#1a1a1a]" />
        
        {/* CRT Scanline Overlay */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,255,255,0.01),rgba(255,255,255,0.02),rgba(255,255,255,0.01))] bg-[length:100%_4px,2px_100%]" />
        
        {/* Minimal HUD Top Bar */}
        <div className="absolute top-4 left-4">
          <div className="text-white/40 text-[10px] font-bold tracking-[0.3em] font-mono">PATLOEBER</div>
        </div>

        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <div className="text-[#eab308] text-sm font-mono font-black tracking-widest uppercase drop-shadow-[0_0_8px_rgba(234,179,8,0.3)]">
            Score: {gameState.score.toString().padStart(6, '0')}
          </div>
          <div className="w-40 h-1 bg-white/10 relative overflow-hidden border border-white/5">
            <motion.div 
              className="h-full bg-[#eab308] shadow-[0_0_10px_#eab308]" 
              initial={{ width: '100%' }}
              animate={{ width: `${gameState.health}%` }}
              transition={{ type: 'spring', damping: 20 }}
            />
          </div>
        </div>

        {/* Start / Game Over Screen */}
        <AnimatePresence>
          {gameState.gameStatus !== 'playing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/95 backdrop-blur-xl text-center p-8 z-50 text-white font-mono"
            >
              <div className="mb-2 text-[#eab308]/40 text-xs tracking-[0.3em] font-bold uppercase">Delta Systems Integrated</div>
              <h2 className="text-7xl font-black text-white mb-4 tracking-tighter italic drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">HANDBLAST <span className="text-[#eab308]">DELTA</span></h2>
              <div className="w-24 h-1 bg-[#eab308] mb-8" />
              
              <p className="text-white/60 max-w-md mb-10 leading-relaxed font-bold text-sm tracking-wide">
                CONTROL YOUR INTERCEPTOR THROUGH THE OPTIC LINK. <br/>
                <span className="text-black bg-[#eab308] px-2">PINCH THUMB & INDEX</span> TO RELEASE CHARGE.
              </p>
              
              {gameState.gameStatus === 'gameOver' && (
                <div className="mb-10 p-6 border-2 border-red-500/50 bg-red-950/20 text-red-500 backdrop-blur-sm">
                  <div className="text-3xl font-black italic tracking-tighter mb-1">TERMINATION DETECTED</div>
                  <div className="text-5xl font-black">{gameState.score}</div>
                  <div className="text-[10px] uppercase tracking-widest mt-2 opacity-50 text-white">Delta Buffer Purged</div>
                </div>
              )}

              <button 
                onClick={startGame}
                className="group relative px-12 py-5 overflow-hidden border border-[#eab308]"
              >
                <div className="absolute inset-0 bg-[#eab308] translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <div className="relative z-10 text-[#eab308] group-hover:text-black font-black text-2xl tracking-tighter flex flex-col items-center transition-colors duration-300">
                  <span>{gameState.gameStatus === 'idle' ? 'INITIATE NEURAL LINK' : 'RETRY SEQUENCE'}</span>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!isHandVisible && gameState.gameStatus === 'playing' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="p-4 bg-red-500/80 text-white font-bold animate-pulse">
              SIGNAL LOST! SHOW YOUR PALM TO CAMERA
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
