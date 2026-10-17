// The example's own script: Connect points the driver's system at the broker in the fields; Publish sends the field's text.
var MqttExample = {
  connect: function () {
    CF.getJoins([Joins.s.host, Joins.s.port], function (j) {
      var host = j[Joins.s.host] ? String(j[Joins.s.host].value).trim() : '';
      var port = Number(j[Joins.s.port] ? j[Joins.s.port].value : 0) || 1883;
      if (host) IvaMqtt.reconnect('mqtt', host, port);
    });
  },
  say: function () {
    CF.getJoin(Joins.s.say, function (join, value) {
      if (value) IvaMqtt.publish('mqtt', 'home/say', value);
    });
  }
};
