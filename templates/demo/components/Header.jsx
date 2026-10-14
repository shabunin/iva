import { colors, font } from '../theme.js';

/**
 * The title of a page, a back button when it has somewhere to go back to,
 * and whether the receiver is connected.
 * @param {{ title: string, back?: string }} props
 */
export default function Header({ title, back }) {
  return (
    <>
      {back && (
        <Button x={40} y={30} w={120} h={60} text="‹ Back" page={back} bg={colors.tile} active={{ bg: colors.accent }} font={font} fontSize={20} />
      )}
      <Text x={back ? 190 : 40} y={30} w={560} h={60} text={title} font={font} fontSize={34} bold />
      <Button x={804} y={30} w={180} h={60} join={d('online')} feedback="none" text="offline" activeText="connected"
              bg={colors.off} active={{ bg: colors.on }} font={font} fontSize={18} />
    </>
  );
}
