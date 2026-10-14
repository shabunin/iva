import { colors, font } from '../theme.js';

/**
 * A toggle: on / off on a digital join.
 * @param {{ x: number, y: number, label: string, join: string | number, w?: number, h?: number }} props
 */
export default function Tile({ x, y, label, join, w = 220, h = 140 }) {
  return (
    <Button x={x} y={y} w={w} h={h} join={join} feedback="toggle" text={label}
            bg={colors.tile} active={{ bg: colors.accent }} font={font} fontSize={24} />
  );
}
