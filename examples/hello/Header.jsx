import { theme } from './theme.js';

export default function Header({ title }) {
  return (
    <>
      <Text x={40} y={30} w={700} h={60} fontSize={34} bold>{title}</Text>
      <Text x={760} y={30} w={224} h={60} align="right" color={theme.dim} fontSize={18}>iva</Text>
    </>
  );
}
