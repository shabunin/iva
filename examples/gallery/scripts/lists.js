// The gallery's live list (l liveRooms): rooms come and go as a script adds and removes them -
// CF.listAdd / CF.listRemove, which the list shows in its insertTransition / deleteTransition; one held
// a moment goes (the row's hold action). An item's toggle stays its own as others come and go.
var GalleryList = (function () {
  var rooms = ['Living room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Garden', 'Hall', 'Attic', 'Cellar', 'Bathroom', 'Studio', 'Terrace'];
  var n = 0;
  var floors = 0;
  var list = function () { return Joins.l.liveRooms; };
  /** an item: its room, and when it came - a value with a token ([when]) its text puts in */
  var item = function () {
    var room = rooms[n % rooms.length];
    n++;
    return { s1: room, s2: { value: 'added at [when]', tokens: { '[when]': new Date().toTimeString().slice(0, 8) } } };
  };
  return {
    fill: function () {
      CF.listRemove(list());
      CF.listAdd(list(), [{ title: true, s1: 'Ground floor' }, item(), item(), item()]);
    },
    /** at the top */
    add: function () { CF.listAdd(list(), [item()], 0); },
    /** a title item (the list's title subpage) at the top */
    title: function () { CF.listAdd(list(), [{ title: true, s1: 'Floor ' + (++floors) }], 0); },
    /** the item held (a row's hold action: the list and the index a list item's script gets) */
    hold: function (list, index) {
      if (list && index !== null && index !== undefined) CF.listRemove(list, Number(index), 1);
    },
    /** the last one */
    remove: function () {
      CF.listInfo(list(), function (l, count) {
        if (count) CF.listRemove(list(), count - 1, 1);
      });
    },
  };
})();
