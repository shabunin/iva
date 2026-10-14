import { ui, t } from '../ui.js';
import Shell from '../components/Shell.jsx';

export default (
  <Page name="Lists" bg={t.page}>
    <ui.Card title="DataList" x={16} y={88} w={600} h={696}>
      <Text x={28} y={50} w={540} h={24} text="headers, rows, an alert, a spacer - filled at start" color={t.muted} font={t.font} fontSize={16} />
      <ui.DataList x={20} y={84} w={560} h={596} join="devices" items={[
        { header: 'Living room' },
        { icon: 'lightbulb', title: 'Ceiling light', subtitle: 'Dimmer', value: '70 %' },
        { icon: 'tv', title: 'TV', subtitle: 'Samsung', value: 'On' },
        { icon: 'triangle-exclamation', title: 'Window open', subtitle: 'Since 14:20', alert: true },
        { spacer: true },
        { header: 'Kitchen' },
        { icon: 'lightbulb', title: 'Spots', subtitle: 'Relay', value: 'Off' },
        { icon: 'snowflake', title: 'Fridge', subtitle: 'Sensor', value: '4 °C' },
        { icon: 'droplet', title: 'Dishwasher', subtitle: 'Running', value: '25 min' },
        { spacer: true },
        { header: 'Outside' },
        { icon: 'temperature-half', title: 'Garden', subtitle: 'Sensor', value: '12 °C' },
        { icon: 'car', title: 'Garage door', subtitle: 'Motor', value: 'Closed' },
      ]} />
    </ui.Card>

    <ui.Card title="ListRow" x={632} y={88} w={632} h={340}>
      <ui.ListRow x={28} y={56} w={576} icon="moon" title="Night mode" subtitle="with a toggle" toggle="night" />
      <ui.ListRow x={28} y={120} w={576} icon="temperature-half" title="Temperature" subtitle="with a value" value="22.4 °C" />
      <ui.ListRow x={28} y={184} w={576} icon="gear" title="Settings" subtitle="tappable: a chevron" chevron page="Overview" />
      <ui.ListRow x={28} y={248} w={576} title="Plain row" subtitle="no icon, no divider" divider={false} />
    </ui.Card>

    <ui.Card title="ScrollBox" x={632} y={444} w={632} h={340}>
      <ui.ScrollBox x={28} y={56} w={576} h={260} join="lines" lines={Array.from({ length: 12 }, (_, i) => `Line ${i + 1} - drag to scroll`)} />
    </ui.Card>
    <Shell section="Lists" />
  </Page>
);
