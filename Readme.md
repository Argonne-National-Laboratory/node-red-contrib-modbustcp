node-red-contrib-bmp085
========================

A <a href="http://nodered.org" target="_new">Node-RED</a> node to communicate [MODBUS TCP](https://www.npmjs.com/package/node-modbus).

Install
-------

Run command on Node-RED installation directory

	npm install node-red-contrib-modbus

Pre-reqs
--------

Install first node-jsmodbus. NOTE: Modified files included here, but still some problems with function codes 15 and 16.
Tested with python modbus server (more testing needed for error handling etc.).

Usage
-----

Use Function node to define msg.fc (function code) and other needed parameters.
Then connect it to modbus-client node that will connect to modbus server.

![node-red-modbus-flow] (example.png)

Example Node-RED flow, see MODBUS_TEST.json

[
    TODO paste here
]
