import { useEffect, useMemo, useRef, useState } from "react";

const GRID_SIZE = 16;
const GRID_COLUMNS = 4;
const BASE_PATTERN_LENGTH = 3;
const FLASH_DURATION_MS = 520;
const FLASH_GAP_MS = 180;
const NEXT_ROUND_DELAY_MS = 900;
const ROUND_TIME_LIMIT_SECONDS = 30;
const MAX_PATTERN_LENGTH = 6;

type TileFeedback = "idle" | "active" | "correct" | "wrong";
type GameStatus = "idle" | "showing" | "playing" | "round-complete";

function createAudioContext() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

function playTone(
  audioContext: AudioContext,
  options: { frequency: number; duration: number; type: OscillatorType; gain: number; slideTo?: number },
) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, now);

  if (options.slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(options.slideTo, now + options.duration);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(options.gain, now + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + options.duration + 0.02);
}

function playCorrectSound(audioContext: AudioContext) {
  playTone(audioContext, { frequency: 660, duration: 0.12, type: "sine", gain: 0.05, slideTo: 880 });
}

function playWrongSound(audioContext: AudioContext) {
  playTone(audioContext, { frequency: 210, duration: 0.18, type: "sawtooth", gain: 0.035, slideTo: 120 });
}

function randomTileIndex() {
  return Math.floor(Math.random() * GRID_SIZE);
}

function createPattern(length: number) {
  return Array.from({ length }, () => randomTileIndex());
}

function tileClassName(feedback: TileFeedback) {
  if (feedback === "active") return "game-tile game-tile--active";
  if (feedback === "correct") return "game-tile game-tile--correct";
  if (feedback === "wrong") return "game-tile game-tile--wrong";
  return "game-tile";
}

export function PatternGame() {
  const [pattern, setPattern] = useState<number[]>([]);
  const [displayLength, setDisplayLength] = useState(BASE_PATTERN_LENGTH);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [playerStep, setPlayerStep] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(1);
  const [feedbackMap, setFeedbackMap] = useState<Record<number, TileFeedback>>({});
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME_LIMIT_SECONDS);
  const [roundTimedOut, setRoundTimedOut] = useState(false);

  const timersRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const roundTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  const clearRoundTimer = () => {
    if (roundTimerRef.current !== null) {
      window.clearTimeout(roundTimerRef.current);
      roundTimerRef.current = null;
    }

    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearTimers();
      clearRoundTimer();
    },
    [],
  );

  const tiles = useMemo(
    () => Array.from({ length: GRID_SIZE }, (_, index) => index),
    [],
  );

  const resetFeedback = () => setFeedbackMap({});

  const endGame = () => {
    clearTimers();
    clearRoundTimer();
    setPattern([]);
    setDisplayLength(BASE_PATTERN_LENGTH);
    setStatus("idle");
    setActiveTile(null);
    setPlayerStep(0);
    setScore(0);
    setStreak(0);
    setRound(1);
    setTimeLeft(ROUND_TIME_LIMIT_SECONDS);
    setRoundTimedOut(false);
    resetFeedback();
  };

  const queueNextRound = (hadMistake: boolean) => {
    clearRoundTimer();
    setStatus("round-complete");
    const nextLength = hadMistake ? displayLength : Math.min(displayLength + 1, MAX_PATTERN_LENGTH);
    const nextRound = hadMistake ? round : round + 1;
    const nextPattern = createPattern(nextLength);

    const roundTimer = window.setTimeout(() => {
      setPattern(nextPattern);
      setDisplayLength(nextLength);
      setRound(nextRound);
      setTimeLeft(ROUND_TIME_LIMIT_SECONDS);
      setRoundTimedOut(false);
      resetFeedback();
      showPattern(nextPattern);
    }, NEXT_ROUND_DELAY_MS);

    timersRef.current.push(roundTimer);
  };

  const showPattern = (nextPattern: number[]) => {
    clearTimers();
    clearRoundTimer();
    resetFeedback();
    setRoundTimedOut(false);
    setTimeLeft(ROUND_TIME_LIMIT_SECONDS);
    setStatus("showing");
    setPlayerStep(0);
    setActiveTile(null);

    nextPattern.forEach((tile, stepIndex) => {
      const startAt = stepIndex * (FLASH_DURATION_MS + FLASH_GAP_MS);
      const activateTimer = window.setTimeout(() => {
        setActiveTile(tile);
      }, startAt);

      const deactivateTimer = window.setTimeout(() => {
        setActiveTile((current) => (current === tile ? null : current));
      }, startAt + FLASH_DURATION_MS);

      timersRef.current.push(activateTimer, deactivateTimer);
    });

    const completeTimer = window.setTimeout(() => {
      setActiveTile(null);
      setStatus("playing");
    }, nextPattern.length * (FLASH_DURATION_MS + FLASH_GAP_MS));

    timersRef.current.push(completeTimer);
  };

  useEffect(() => {
    clearRoundTimer();

    if (status !== "playing") {
      return;
    }

    setTimeLeft(ROUND_TIME_LIMIT_SECONDS);
    countdownIntervalRef.current = window.setInterval(() => {
      setTimeLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    roundTimerRef.current = window.setTimeout(() => {
      setRoundTimedOut(true);
      setStreak(0);
      setPlayerStep(0);
      queueNextRound(true);
    }, ROUND_TIME_LIMIT_SECONDS * 1000);

    return clearRoundTimer;
  }, [status, displayLength, round]);

  const startGame = () => {
    const initialPattern = createPattern(BASE_PATTERN_LENGTH);
    clearTimers();
    clearRoundTimer();
    setPattern(initialPattern);
    setDisplayLength(BASE_PATTERN_LENGTH);
    setStatus("idle");
    setActiveTile(null);
    setPlayerStep(0);
    setScore(0);
    setRound(1);
    setStreak(0);
    setTimeLeft(ROUND_TIME_LIMIT_SECONDS);
    setRoundTimedOut(false);
    resetFeedback();
    showPattern(initialPattern);
  };

  const handleTileClick = (tile: number) => {
    if (status !== "playing") return;

    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }

    if (audioContextRef.current?.state === "suspended") {
      void audioContextRef.current.resume();
    }

    const expectedTile = pattern[playerStep];
    const isCorrect = tile === expectedTile;
    const isFinalStep = playerStep === pattern.length - 1;

    if (audioContextRef.current) {
      if (isCorrect) {
        playCorrectSound(audioContextRef.current);
      } else {
        playWrongSound(audioContextRef.current);
      }
    }

    setFeedbackMap((current) => ({
      ...current,
      [tile]: isCorrect ? "correct" : "wrong",
    }));

    const feedbackTimer = window.setTimeout(() => {
      setFeedbackMap((current) => {
        const next = { ...current };
        delete next[tile];
        return next;
      });
    }, 360);
    timersRef.current.push(feedbackTimer);

    if (isCorrect) {
      setScore((current) => current + 10);
      setStreak((current) => current + 1);
    } else {
      setStreak(0);
    }

    if (isFinalStep) {
      queueNextRound(!isCorrect);
      setPlayerStep(0);
      return;
    }

    setPlayerStep((current) => current + 1);
  };

  const statusLabel =
    status === "idle"
      ? "Press start to begin"
      : status === "showing"
        ? "Watch the glowing pattern"
        : status === "playing"
          ? `Repeat the pattern in order · ${timeLeft}s left`
          : roundTimedOut
            ? "Time's up · Next sequence loading"
            : "Next sequence loading";

  return (
    <main className="game-shell">
      <div className="game-frame">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="game-panel flex flex-col justify-between gap-10 p-6 md:p-8">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-primary">Pattern Game</p>
              <div className="space-y-3">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
                  Memorize the pulse. Repeat it cleanly.
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
                  A calm dark grid with neon prompts. Match each glowing tile in sequence to build your score.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="game-stat">
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Score</span>
                <strong className="text-3xl font-semibold text-foreground">{score}</strong>
              </div>
              <div className="game-stat">
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Round</span>
                <strong className="text-3xl font-semibold text-foreground">{round}</strong>
              </div>
              <div className="game-stat">
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Streak</span>
                <strong className="text-3xl font-semibold text-foreground">{streak}</strong>
              </div>
              <div className="game-stat sm:col-span-3 lg:col-span-1">
                <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Timer</span>
                <strong className="text-3xl font-semibold text-foreground">{timeLeft}s</strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {status !== "idle" && (
                <button type="button" className="game-start-button" onClick={endGame}>
                  Restart
                </button>
              )}
              <p className="text-sm text-muted-foreground">
                {statusLabel} · +10 for every correct tile, 0 for a wrong pick.
              </p>
            </div>
          </div>

          <div className="game-panel relative p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Grid</p>
                <p className="mt-1 text-sm text-foreground">
                  {GRID_COLUMNS} × {GRID_COLUMNS} interactive board
                </p>
              </div>
              <div className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs tracking-[0.24em] text-primary uppercase">
                {status === "playing" ? `Step ${playerStep + 1}/${pattern.length}` : statusLabel}
              </div>
            </div>

            <div className="relative">
              <div className="game-grid">
                {tiles.map((tile) => {
                  const feedback = activeTile === tile ? "active" : (feedbackMap[tile] ?? "idle");

                  return (
                    <button
                      key={tile}
                      type="button"
                      className={tileClassName(feedback)}
                      onClick={() => handleTileClick(tile)}
                      disabled={status !== "playing"}
                      aria-label={`Grid tile ${tile + 1}`}
                    >
                      <span className="sr-only">Tile {tile + 1}</span>
                    </button>
                  );
                })}
              </div>

              {status === "idle" && (
                <div className="game-overlay">
                  <button type="button" className="game-start-button" onClick={startGame}>
                    Start
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}