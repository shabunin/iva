// The gallery's plant, simulated on the panel: what devices would send (the Charts page).
// Analog joins run 0..65535; each stands for a range (the curves' / datasets' `scale`).
const level = (v, min, max) => Math.round(Math.max(0, Math.min(1, (v - min) / (max - min))) * 65535);

/** a week of energy (kWh per day) as the bar chart's JSON */
function galleryWeek() {
  const days = Array.from({ length: 7 }, (_, i) => Math.round((18 + 10 * Math.random() + (i >= 5 ? 6 : 0)) * 10) / 10);
  CF.setJoin(Joins.s.energyWeek, JSON.stringify({ datasets: [{ data: days }] }));
}

CF.modules.push({
  name: 'gallery-plant',
  setup() {
    let k = 0;
    const tick = () => {
      k++;
      const supply = 68 + 6 * Math.sin(k / 40) + Math.random() * 1.2;
      const back = supply - 17 - 3 * Math.cos(k / 25) + Math.random();
      const heating = 4 + 2.5 * Math.sin(k / 40) + Math.random() * 0.4;
      const lights = 0.4 + 0.8 * Math.sin(k / 15) ** 2;
      const kitchen = 1 + (k % 60 < 20 ? 2.2 : 0) + Math.random() * 0.3;
      const other = 0.8 + Math.random() * 0.2;
      CF.setJoin(Joins.a.supplyT, level(supply, 0, 100));
      CF.setJoin(Joins.a.returnT, level(back, 0, 100));
      CF.setJoin(Joins.a.power, level(heating + lights + kitchen + other, 0, 20));
      CF.setJoin(Joins.a.pHeating, level(heating, 0, 10));
      CF.setJoin(Joins.a.pLights, level(lights, 0, 10));
      CF.setJoin(Joins.a.pKitchen, level(kitchen, 0, 10));
      CF.setJoin(Joins.a.pOther, level(other, 0, 10));
    };
    tick();
    setInterval(tick, 1000);
    galleryWeek();
  },
});
