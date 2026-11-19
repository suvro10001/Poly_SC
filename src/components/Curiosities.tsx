import React, { useState } from 'react';
import { soundManager } from '../utils/audio';
import { RotateCcw, Sparkles, Award } from 'lucide-react';

interface Tile {
  id: number;
  value: number;
}

export const Curiosities: React.FC = () => {
  // Game State for "Make 1"
  const initialTiles: Tile[] = [
    { id: 1, value: 8 },
    { id: 2, value: 4 },
    { id: 3, value: 2 },
    { id: 4, value: 1 },
  ];

  const [tiles, setTiles] = useState<Tile[]>(initialTiles);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [selectedOp, setSelectedOp] = useState<'+' | '-' | '×' | '÷'>('÷');
  const [moves, setMoves] = useState(0);
  const [history, setHistory] = useState<Tile[][]>([]);
  const [won, setWon] = useState(false);

  // Unit converter state
  const [selectedUnit, setSelectedUnit] = useState<string>('day');

  const unitConversions: Record<
    string,
    { label: string; details: { name: string; value: string }[] }
  > = {
    day: {
      label: '1 Solar Day',
      details: [
        { name: 'Hours', value: '24 hr' },
        { name: 'Minutes', value: '1,440 min' },
        { name: 'Seconds', value: '86,400 sec' },
        { name: 'Milliseconds', value: '86,400,000 ms' },
      ],
    },
    meter: {
      label: '1 Standard Meter',
      details: [
        { name: 'Feet', value: '3.28084 ft' },
        { name: 'Inches', value: '39.3701 in' },
        { name: 'Centimeters', value: '100 cm' },
        { name: 'Light travel time', value: '~3.3356 nanoseconds' },
      ],
    },
    gigabyte: {
      label: '1 Gigabyte (GB)',
      details: [
        { name: 'Megabytes', value: '1,024 MB' },
        { name: 'Kilobytes', value: '1,048,576 KB' },
        { name: 'Bytes', value: '1,073,741,824 B' },
        { name: 'Binary bits', value: '8,589,934,592 bits' },
      ],
    },
    lightyear: {
      label: '1 Light-Year',
      details: [
        { name: 'Kilometers', value: '9,460,730,472,580 km' },
        { name: 'Miles', value: '5,878,625,370,000 mi' },
        { name: 'Astronomical Units', value: '63,241.1 AU' },
        { name: 'Parsecs', value: '0.3066 pc' },
      ],
    },
    kilogram: {
      label: '1 Kilogram (kg)',
      details: [
        { name: 'Pounds', value: '2.20462 lb' },
        { name: 'Ounces', value: '35.274 oz' },
        { name: 'Grams', value: '1,000 g' },
        { name: 'Planck mass', value: '45,945,700 m_P' },
      ],
    },
  };

  const handleTileClick = (tile: Tile) => {
    soundManager.playClick();
    if (selectedTileId === null) {
      setSelectedTileId(tile.id);
      return;
    }

    if (selectedTileId === tile.id) {
      setSelectedTileId(null);
      return;
    }

    // Merge selectedTile with tile
    const firstTile = tiles.find((t) => t.id === selectedTileId);
    if (!firstTile) return;

    let result = 0;
    if (selectedOp === '+') result = firstTile.value + tile.value;
    else if (selectedOp === '-') result = firstTile.value - tile.value;
    else if (selectedOp === '×') result = firstTile.value * tile.value;
    else if (selectedOp === '÷') {
      if (tile.value === 0) return;
      result = firstTile.value / tile.value;
    }

    // Disallow non-integer or negative for simplicity
    if (!Number.isInteger(result) || result <= 0) {
      // Invalid operation feedback
      return;
    }

    setHistory([...history, tiles]);
    const nextTiles = tiles
      .filter((t) => t.id !== selectedTileId && t.id !== tile.id)
      .concat({ id: Date.now(), value: result });

    setTiles(nextTiles);
    setSelectedTileId(null);
    setMoves(moves + 1);

    if (nextTiles.length === 1 && nextTiles[0].value === 1) {
      setWon(true);
      soundManager.playChime();
    }
  };

  const undoMove = () => {
    if (history.length === 0) return;
    soundManager.playClick();
    const prev = history[history.length - 1];
    setTiles(prev);
    setHistory(history.slice(0, -1));
    setMoves(Math.max(0, moves - 1));
    setWon(false);
    setSelectedTileId(null);
  };

  const resetGame = (level = 1) => {
    soundManager.playClick();
    let newSet: Tile[] = [];
    if (level === 1) {
      newSet = [
        { id: 1, value: 8 },
        { id: 2, value: 4 },
        { id: 3, value: 2 },
        { id: 4, value: 1 },
      ];
    } else if (level === 2) {
      newSet = [
        { id: 1, value: 9 },
        { id: 2, value: 3 },
        { id: 3, value: 2 },
      ];
    } else {
      newSet = [
        { id: 1, value: 12 },
        { id: 2, value: 6 },
        { id: 3, value: 3 },
        { id: 4, value: 2 },
      ];
    }
    setTiles(newSet);
    setSelectedTileId(null);
    setMoves(0);
    setHistory([]);
    setWon(false);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200/60 pb-4 dark:border-neutral-800/60">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Curiosities of "1"
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            The fundamental unit: mathematical foundations, dimensional constants, and the Make-1 puzzle.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Multiplicative Identity</span>
          <span aria-hidden="true">·</span>
          <span>Fundamental Quantum</span>
        </div>
      </div>

      {/* Mini Arithmetic Game: "Make 1" */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neutral-900 dark:text-white" />
              <span>Mini-Game: Make 1</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Combine all numbers using basic operators until exactly ONE tile remains with value 1.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 tabular-nums font-mono">
              Moves: {moves}
            </span>
            <button
              onClick={undoMove}
              disabled={history.length === 0}
              className="px-2.5 py-1 text-xs font-medium border border-neutral-200 dark:border-neutral-800 rounded-md disabled:opacity-30 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
            >
              Undo
            </button>
            <button
              onClick={() => resetGame(1)}
              className="p-1.5 border border-neutral-200 dark:border-neutral-800 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
              title="Reset Puzzle"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Operator Selector */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-xs text-neutral-500 mr-2">Operator:</span>
          {(['+', '-', '×', '÷'] as const).map((op) => (
            <button
              key={op}
              onClick={() => {
                soundManager.playClick();
                setSelectedOp(op);
              }}
              className={`w-9 h-9 rounded-lg font-mono text-base font-bold transition-all ${
                selectedOp === op
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 hover:bg-neutral-200'
              }`}
            >
              {op}
            </button>
          ))}
        </div>

        {/* Tiles Board */}
        <div className="flex flex-wrap items-center justify-center gap-4 py-4 min-h-[120px]">
          {won ? (
            <div className="flex flex-col items-center justify-center space-y-3 p-6 text-center">
              <Award className="w-12 h-12 text-emerald-600 dark:text-emerald-500" />
              <div className="text-lg font-bold text-neutral-900 dark:text-white">
                Solved! You reduced everything to 1.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => resetGame(2)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  Play Level 2
                </button>
                <button
                  onClick={() => resetGame(3)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Play Level 3
                </button>
              </div>
            </div>
          ) : (
            tiles.map((t) => {
              const isSelected = selectedTileId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTileClick(t)}
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex flex-col items-center justify-center font-mono text-2xl font-bold transition-all shadow-xs ${
                    isSelected
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 scale-105 ring-4 ring-neutral-300 dark:ring-neutral-700'
                      : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700'
                  }`}
                >
                  <span className="tabular-nums">{t.value}</span>
                  {isSelected && (
                    <span className="text-[10px] font-sans font-normal opacity-70">Selected</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {!won && (
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            {selectedTileId === null
              ? 'Click a tile to select it, then choose another tile to apply the operator.'
              : `Selected ${tiles.find((t) => t.id === selectedTileId)?.value}. Now click a second tile to apply (${selectedOp}).`}
          </p>
        )}
      </div>

      {/* Dimensional Breakdown: The Power of 1 Unit */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              The Measure of "1"
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Exact breakdowns when physical, spatial, and temporal reality is scaled to 1.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-x-auto">
            {Object.keys(unitConversions).map((key) => (
              <button
                key={key}
                onClick={() => {
                  soundManager.playClick();
                  setSelectedUnit(key);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 ${
                  selectedUnit === key
                    ? 'bg-white text-neutral-900 shadow-xs dark:bg-neutral-900 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                1 {key}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {unitConversions[selectedUnit].details.map((d) => (
            <div
              key={d.name}
              className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3.5 dark:border-neutral-800/80 dark:bg-neutral-800/40"
            >
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{d.name}</div>
              <div className="text-sm font-semibold font-mono tabular-nums text-neutral-900 dark:text-white mt-1">
                {d.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mathematical & Philosophical Properties of 1 */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
          Mathematical Axioms of One
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1.5 p-3.5 rounded-lg border border-neutral-100 dark:border-neutral-800/80">
            <div className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
              Multiplicative Identity
            </div>
            <p className="text-neutral-500 dark:text-neutral-400">
              For any number x, x × 1 = x. One leaves every entity unaltered in magnitude while anchoring all arithmetic.
            </p>
          </div>

          <div className="space-y-1.5 p-3.5 rounded-lg border border-neutral-100 dark:border-neutral-800/80">
            <div className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
              Euler's Identity
            </div>
            <p className="text-neutral-500 dark:text-neutral-400">
              e^(iπ) + 1 = 0. Richard Feynman called it "the most remarkable formula in mathematics," linking geometry, analysis, algebra, and 1.
            </p>
          </div>

          <div className="space-y-1.5 p-3.5 rounded-lg border border-neutral-100 dark:border-neutral-800/80">
            <div className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">
              The Digital Quantum
            </div>
            <p className="text-neutral-500 dark:text-neutral-400">
              In Boolean logic and transistor gates, '1' represents high voltage, truth, and state existence. All software is composed of 1 and 0.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
