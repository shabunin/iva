// The header every GUI of the example shares.
export const PALETTE = { home: '#14171a', lights: '#1a2029', media: '#201a28' };

export const Nav = ({ title, subtitle }) => (
  <>
    <Text x={80} y={70} w={1120} h={60} text={title} color="#ffffff" fontSize={44} bold />
    <Text x={80} y={140} w={1120} h={40} text={subtitle} color="#9aa4b1" fontSize={22} />
  </>
);
