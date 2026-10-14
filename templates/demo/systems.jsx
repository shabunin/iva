// The AV receiver: a TCP connection, what the panel sends, and what it reads back.
export default (
  <System name="Receiver" host="192.168.1.50" port={23} eom="\x0D" connectJoin={d('online')}>
    <Command name="PowerOn" send="PWON\x0D" />
    <Command name="PowerOff" send="PWSTANDBY\x0D" />
    <Command name="InputMovie" send="SIBD\x0D" />
    {/* [sliderval]: the slider's value as it's dragged */}
    <Command name="Volume" send="MV[sliderval]\x0D" />

    <Feedback name="Power" regex="PW(ON|STANDBY)">
      <Capture join={d('tv')} onVal="ON" offVal="STANDBY" />
    </Feedback>
    {/* the device's volume, 0..98, onto the slider's 0..65535 */}
    <Feedback name="Volume" regex="MV(\d+)">
      <Capture join={a('volume')} min={0} max={98} />
    </Feedback>
  </System>
);
