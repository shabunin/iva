// The gallery's live list (l liveRooms): rooms come and go as a script adds and removes them -
// CF.listAdd / CF.listRemove, which the list shows in its insertTransition / deleteTransition; one held
// a moment shows its Delete button (the item's d4 join), a tap on that removes it. An item's toggle stays
// its own as others come and go.
var GalleryList = (function () {
  var rooms = ['Living room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Garden', 'Hall', 'Attic', 'Cellar', 'Bathroom', 'Studio', 'Terrace'];
  var n = 0;
  var floors = 0;
  var list = function () { return Joins.l.liveRooms; };
  /** the item whose Delete button shows: its d4 join ("l12:3:d4"), one at a time */
  var armed = null;
  function disarm() {
    if (armed) CF.setJoin(armed, 0);
    armed = null;
  }
  /** an item: its room, and when it came - a value with a token ([when]) its text puts in */
  var item = function () {
    var room = rooms[n % rooms.length];
    n++;
    return { s1: room, s2: { value: 'added at [when]', tokens: { '[when]': new Date().toTimeString().slice(0, 8) } } };
  };
  return {
    fill: function () {
      disarm();
      CF.listRemove(list());
      CF.listAdd(list(), [{ title: true, s1: 'Ground floor' }, item(), item(), item()]);
    },
    /** at the top */
    add: function () { disarm(); CF.listAdd(list(), [item()], 0); },
    /** a title item (the list's title subpage) at the top */
    title: function () { disarm(); CF.listAdd(list(), [{ title: true, s1: 'Floor ' + (++floors) }], 0); },
    /** a row held: its Delete button shows (the one shown before goes) */
    arm: function (list, index) {
      if (!list || index === null || index === undefined) return;
      disarm();
      armed = list + ':' + index + ':d4';
      CF.setJoin(armed, 1);
    },
    /** a tap on a row: a Delete button shown goes */
    tap: disarm,
    /** the Delete button tapped: its item goes - if it was shown (the button's join high); invisible, it does nothing */
    del: function (list, index, value) {
      if (!(value == 1 || value === true)) return;
      disarm();
      CF.listRemove(list, Number(index), 1);
    },
    /** the last one */
    remove: function () {
      disarm();
      CF.listInfo(list(), function (l, count) {
        if (count) CF.listRemove(list(), count - 1, 1);
      });
    },
  };
})();
