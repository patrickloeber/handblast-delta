import { GameCanvas } from './components/GameCanvas';

export default function App() {
  return (
    <div className="w-full h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0c0a09]/80 backdrop-blur-[100px] z-0" />
      <div className="relative z-10 w-full h-full max-w-6xl max-h-[800px]">
        <GameCanvas />
      </div>
    </div>
  );
}
