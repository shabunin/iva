// iViewer JavaScript: runs in the panel (the CF.* API). `Joins` is generated
// by iva from the project's named joins (Joins.s.volumeText -> "s1001").

CF.userMain = function () {
  CF.listAdd(Joins.l.rooms, [
    { s1: 'Living room' },
    { s1: 'Kitchen' },
    { s1: 'Bedroom' },
    { s1: 'Office' },
  ]);

  // the volume as a percentage, next to the slider
  CF.watch(CF.JoinChangeEvent, Joins.a.volume, function (join, value) {
    CF.setJoin(Joins.s.volumeText, Math.round(value / 655.35) + '%');
  });
};
