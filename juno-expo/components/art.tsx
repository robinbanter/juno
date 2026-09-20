import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { colors } from "../theme/tokens";

/**
 * Illustrations, drawn in code.
 *
 * These are vector rather than bitmap for a specific reason: every figure here
 * is derived from the product — the network is people around a market, the
 * portfolio object is a stack of positions — and a vector version stays sharp
 * at any size, themes with the palette, and adds nothing to the bundle.
 *
 * They are also not placeholders standing in for missing art. If generated
 * artwork replaces them later it should be because it says something these
 * cannot, not because these are unfinished.
 */

/**
 * A market with people around it.
 *
 * The centre is the thing being traded; the ring is the audience holding a
 * position in it. That is the entire product in one figure, which is why the
 * connecting lines are drawn *to* the centre rather than between the people.
 */
export function OnboardingArt({ size = 280 }: { size?: number }) {
  const people = [
    { x: 140, y: 34, r: 24, fill: "#F2E230" },
    { x: 232, y: 86, r: 20, fill: "#8B5CF6" },
    { x: 214, y: 196, r: 22, fill: "#2E5BFF" },
    { x: 74, y: 196, r: 26, fill: "#0E9F6E" },
    { x: 44, y: 88, r: 19, fill: "#C77700" },
  ];

  return (
    <Svg width={size} height={size} viewBox="0 0 280 260">
      <Defs>
        <LinearGradient id="core" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#F2E230" />
          <Stop offset="100%" stopColor="#0E9F6E" />
        </LinearGradient>
      </Defs>

      {/* Each person is connected to the market, not to each other. */}
      <G opacity={0.35}>
        {people.map((person) => (
          <Line
            key={`link-${person.x}-${person.y}`}
            x1={person.x}
            y1={person.y}
            x2={140}
            y2={128}
            stroke={colors.lineStrong}
            strokeWidth={2}
          />
        ))}
      </G>

      {/* The market itself: a rising book. */}
      <Circle cx={140} cy={128} r={54} fill="url(#core)" />
      <G>
        {[0, 1, 2, 3].map((i) => (
          <Rect
            key={`bar-${i}`}
            x={118 + i * 12}
            y={142 - i * 13}
            width={8}
            height={14 + i * 13}
            rx={3}
            fill={colors.surface}
            opacity={0.92}
          />
        ))}
      </G>

      {people.map((person) => (
        <G key={`person-${person.x}-${person.y}`}>
          <Circle cx={person.x} cy={person.y} r={person.r} fill={person.fill} />
          <Circle cx={person.x} cy={person.y - person.r * 0.22} r={person.r * 0.34} fill={colors.surface} opacity={0.95} />
          <Path
            d={`M${person.x - person.r * 0.55} ${person.y + person.r * 0.62}
                a ${person.r * 0.55} ${person.r * 0.48} 0 0 1 ${person.r * 1.1} 0`}
            fill={colors.surface}
            opacity={0.95}
          />
        </G>
      ))}
    </Svg>
  );
}

/**
 * The portfolio object: positions stacked into one value.
 *
 * Deliberately an object rather than a chart. A chart here would imply a
 * performance history the app has not measured for a new wallet, whereas a
 * stack reads as "what you hold" and stays honest when that is nothing.
 */
export function PortfolioArt({ size = 130 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 160 160">
      <Defs>
        <LinearGradient id="coinTop" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#F7EE73" />
          <Stop offset="100%" stopColor="#E6D21C" />
        </LinearGradient>
      </Defs>

      {/* Lower discs are the older positions; the top one is the newest. */}
      {[
        { y: 104, fill: "#2E5BFF", opacity: 0.9 },
        { y: 86, fill: "#8B5CF6", opacity: 0.92 },
        { y: 68, fill: "#0E9F6E", opacity: 0.95 },
      ].map((disc) => (
        <G key={`disc-${disc.y}`}>
          <Rect x={30} y={disc.y} width={100} height={20} rx={10} fill={disc.fill} opacity={disc.opacity} />
        </G>
      ))}

      <Rect x={30} y={44} width={100} height={26} rx={13} fill="url(#coinTop)" />
      <Circle cx={80} cy={57} r={8} fill={colors.surface} opacity={0.9} />

      {/* A small upward mark, because a portfolio screen is about direction. */}
      <Path
        d="M108 34 L120 22 M120 22 L120 31 M120 22 L111 22"
        stroke={colors.pos}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Shown where a coin has no artwork of its own. */
export function CoinGlyph({ size = 48, seed = "" }: { size?: number; seed?: string }) {
  // Derived from the mint so the same coin always gets the same figure — the
  // address is the data, not a random fallback.
  const hash = [...seed].reduce((total, char) => total + char.charCodeAt(0), 0);
  const palette = [colors.series[0], colors.series[1], colors.series[2], colors.series[3]];
  const fill = palette[hash % palette.length];
  const second = palette[(hash + 2) % palette.length];

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect width={48} height={48} rx={14} fill={colors.surfaceSunken} />
      <Circle cx={18 + (hash % 7)} cy={20 + (hash % 5)} r={11} fill={fill} opacity={0.9} />
      <Circle cx={30 - (hash % 5)} cy={30 - (hash % 6)} r={9} fill={second} opacity={0.75} />
    </Svg>
  );
}
