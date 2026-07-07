import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export type HandData = {
  x: number;
  y: number;
  isPinching: boolean;
};

export class HandTracker {
  private hands: Hands;
  private camera: Camera | null = null;
  private onResults: (data: HandData | null) => void;

  constructor(videoElement: HTMLVideoElement, onResults: (data: HandData | null) => void) {
    this.onResults = onResults;
    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults(this.handleResults.bind(this));

    this.camera = new Camera(videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });
  }

  private handleResults(results: Results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      // Use index finger TIP (landmark 8) for positioning
      // and check distance between thumb TIP (4) and index TIP (8) for "pinching" (shooting)
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      
      const distance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + 
        Math.pow(indexTip.y - thumbTip.y, 2)
      );

      this.onResults({
        x: 1 - indexTip.x, // Mirror for user
        y: indexTip.y,
        isPinching: distance < 0.05
      });
    } else {
      this.onResults(null);
    }
  }

  public async start() {
    await this.camera?.start();
  }

  public stop() {
    this.camera?.stop();
    this.hands.close();
  }
}
