/**
 * What UPnP AV devices say, as the driver's tests and its fake device use
 * it: a media server's description (as MiniDLNA writes one - relative
 * control URLs, no URLBase), a renderer's (gmediarender-style, with
 * URLBase and an embedded device), a Browse response, DIDL-Lite.
 */

export const SERVER_UDN = 'uuid:4d696e69-444c-164e-9d41-b827eb9c2a01';
export const RENDERER_UDN = 'uuid:5c4f6fd1-b3cd-4cfa-98b5-2d4ca1a7e002';

/** a MediaServer:1 description, MiniDLNA-style: control URLs relative to the location */
export const SERVER_DESCRIPTION = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:dlna="urn:schemas-dlna-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <!-- what MiniDLNA writes -->
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>Living room &amp; study: media</friendlyName>
    <manufacturer>Justin Maggard</manufacturer>
    <manufacturerURL>http://www.netgear.com/</manufacturerURL>
    <modelDescription>MiniDLNA on Linux</modelDescription>
    <modelName>Windows Media Connect compatible (MiniDLNA)</modelName>
    <modelNumber>1.3.0</modelNumber>
    <modelURL>http://www.netgear.com</modelURL>
    <serialNumber>12345678</serialNumber>
    <UDN>${SERVER_UDN}</UDN>
    <dlna:X_DLNADOC xmlns:dlna="urn:schemas-dlna-org:device-1-0">DMS-1.50</dlna:X_DLNADOC>
    <presentationURL>/</presentationURL>
    <iconList>
      <icon><mimetype>image/png</mimetype><width>48</width><height>48</height><depth>24</depth><url>/icons/sm.png</url></icon>
      <icon><mimetype>image/png</mimetype><width>120</width><height>120</height><depth>24</depth><url>/icons/lrg.png</url></icon>
      <icon><mimetype>image/jpeg</mimetype><width>48</width><height>48</height><depth>24</depth><url>/icons/sm.jpg</url></icon>
    </iconList>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <controlURL>/ctl/ContentDir</controlURL>
        <eventSubURL>/evt/ContentDir</eventSubURL>
        <SCPDURL>/ContentDir.xml</SCPDURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <controlURL>/ctl/ConnectionMgr</controlURL>
        <eventSubURL>/evt/ConnectionMgr</eventSubURL>
        <SCPDURL>/ConnectionMgr.xml</SCPDURL>
      </service>
      <service>
        <serviceType>urn:microsoft.com:service:X_MS_MediaReceiverRegistrar:1</serviceType>
        <serviceId>urn:microsoft.com:serviceId:X_MS_MediaReceiverRegistrar</serviceId>
        <controlURL>/ctl/X_MS_MediaReceiverRegistrar</controlURL>
        <eventSubURL>/evt/X_MS_MediaReceiverRegistrar</eventSubURL>
        <SCPDURL>/X_MS_MediaReceiverRegistrar.xml</SCPDURL>
      </service>
    </serviceList>
  </device>
</root>
`;

/** a MediaRenderer:1 description with a URLBase and an embedded device whose services count too */
export const RENDERER_DESCRIPTION = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <URLBase>http://10.0.0.7:49494/</URLBase>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName><![CDATA[Kitchen <speaker>]]></friendlyName>
    <manufacturer>Ivo Clarysse, Henner Zeller, Andrey Demenev</manufacturer>
    <modelName>gmediarender</modelName>
    <modelNumber>0.0.9</modelNumber>
    <UDN>${RENDERER_UDN}</UDN>
    <iconList>
      <icon><mimetype>image/png</mimetype><width>64</width><height>64</height><depth>24</depth><url>grender-64x64.png</url></icon>
    </iconList>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
        <SCPDURL>/upnp/rendertransportSCPD.xml</SCPDURL>
        <controlURL>/upnp/control/rendertransport1</controlURL>
        <eventSubURL>/upnp/event/rendertransport1</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <SCPDURL>/upnp/renderconnmgrSCPD.xml</SCPDURL>
        <controlURL>/upnp/control/renderconnmgr1</controlURL>
        <eventSubURL>/upnp/event/renderconnmgr1</eventSubURL>
      </service>
    </serviceList>
    <deviceList>
      <device>
        <deviceType>urn:schemas-upnp-org:device:Basic:1</deviceType>
        <friendlyName>Kitchen (control)</friendlyName>
        <UDN>uuid:5c4f6fd1-b3cd-4cfa-98b5-2d4ca1a7e003</UDN>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
            <SCPDURL>/upnp/rendercontrolSCPD.xml</SCPDURL>
            <controlURL>/upnp/control/rendercontrol1</controlURL>
            <eventSubURL>/upnp/event/rendercontrol1</eventSubURL>
          </service>
        </serviceList>
      </device>
    </deviceList>
  </device>
</root>
`;

/** a Browse of a music folder: three tracks, as DIDL-Lite (what a Browse response's Result holds, unescaped) */
export const MUSIC_DIDL = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
<item id="1$7$1" parentID="1$7" restricted="1"><dc:title>Blue in Green</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><dc:creator>Miles Davis</dc:creator><dc:date>1959-01-01</dc:date><upnp:artist>Miles Davis</upnp:artist><upnp:album>Kind of Blue</upnp:album><upnp:genre>Jazz</upnp:genre><upnp:originalTrackNumber>3</upnp:originalTrackNumber><upnp:albumArtURI dlna:profileID="JPEG_TN">http://10.0.0.5:8200/AlbumArt/11-1.jpg</upnp:albumArtURI><res size="8237116" duration="0:05:37.000" bitrate="24000" sampleFrequency="44100" nrAudioChannels="2" protocolInfo="http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_CI=0">http://10.0.0.5:8200/MediaItems/1.mp3</res></item>
<item id="1$7$2" parentID="1$7" restricted="1"><dc:title>So What &amp; more</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><upnp:artist>Miles Davis</upnp:artist><upnp:album>Kind of Blue</upnp:album><res size="13492341" duration="0:09:22.000" protocolInfo="http-get:*:audio/mpeg:*">http://10.0.0.5:8200/MediaItems/2.mp3</res></item>
<item id="1$7$3" parentID="1$7" restricted="1"><dc:title>Flamenco Sketches</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><upnp:artist>Miles Davis</upnp:artist><upnp:album>Kind of Blue</upnp:album><res protocolInfo="http-get:*:audio/mpeg:*" duration="0:09:26.000">http://10.0.0.5:8200/MediaItems/3.mp3</res><res protocolInfo="http-get:*:audio/L16;rate=44100;channels=2:*">http://10.0.0.5:8200/MediaItems/3.l16</res></item>
</DIDL-Lite>`;

/** a Browse of the root: the folders MiniDLNA shows */
export const ROOT_DIDL = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
<container id="1" parentID="0" restricted="1" searchable="1" childCount="7"><dc:title>Music</dc:title><upnp:class>object.container.storageFolder</upnp:class><upnp:storageUsed>-1</upnp:storageUsed></container>
<container id="2" parentID="0" restricted="1" searchable="1" childCount="3"><dc:title>Video</dc:title><upnp:class>object.container.storageFolder</upnp:class></container>
<container id="3" parentID="0" restricted="1" searchable="1" childCount="2"><dc:title>Pictures</dc:title><upnp:class>object.container.storageFolder</upnp:class></container>
</DIDL-Lite>`;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** a Browse response around a DIDL-Lite result */
export const browseResponse = (didl: string, returned: number, total: number, updateId = 11) => `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><Result>${escape(didl)}</Result>
<NumberReturned>${returned}</NumberReturned>
<TotalMatches>${total}</TotalMatches>
<UpdateID>${updateId}</UpdateID>
</u:BrowseResponse></s:Body></s:Envelope>`;

/** a UPnPError, as a device answers an action it can't do (HTTP 500 with it) */
export const errorResponse = (code: number, description: string) => `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${escape(description)}</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`;

/** an action's response with these values */
export const actionResponse = (service: string, action: string, values: Record<string, string | number>) => `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action}Response xmlns:u="urn:schemas-upnp-org:service:${service}:1">${
  Object.entries(values).map(([k, v]) => `<${k}>${escape(String(v))}</${k}>`).join('')
}</u:${action}Response></s:Body></s:Envelope>`;

/** an M-SEARCH reply as a device sends one */
export const ssdpReply = (location: string, st: string, udn: string, maxAge = 1800) =>
  `HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=${maxAge}\r\nDATE: Fri, 17 Oct 2026 10:00:00 GMT\r\nST: ${st}\r\nUSN: ${udn}::${st}\r\nEXT:\r\nSERVER: Linux/5.15 DLNADOC/1.50 UPnP/1.0 MiniDLNA/1.3.0\r\nLOCATION: ${location}\r\nContent-Length: 0\r\n\r\n`;

/** a NOTIFY as devices multicast them */
export const ssdpNotify = (location: string, nt: string, udn: string, nts: 'ssdp:alive' | 'ssdp:byebye', maxAge = 1800) =>
  `NOTIFY * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nCACHE-CONTROL: max-age=${maxAge}\r\nLOCATION: ${location}\r\nSERVER: Linux/5.15 UPnP/1.0 MiniDLNA/1.3.0\r\nNT: ${nt}\r\nUSN: ${udn}::${nt}\r\nNTS: ${nts}\r\n\r\n`;
