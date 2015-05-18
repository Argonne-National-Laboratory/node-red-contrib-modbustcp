/**
 * Copyright 2015 Metso Automation Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

/**
 NodeRed node with support for MODBUS TCP based on jsmodbus.

 @author <a href="mailto:mika.karaila@metso.com">Mika Karaila</a> (Process Automation Systems, Metso)
**/
module.exports = function(RED) {
    "use strict";
    var RED = require(process.env.NODE_RED_HOME+"/red/red");
    var settings = RED.settings;
    var util    = require('util');
    // var jsmodbus  = require('./jsmodbus');
    var net             = require('net'),
    tcpServerModule     = require('./tcpServer'),
    serialServerModule  = require('./serialServer');

    function ModbusServerTcpNode(n) {
        RED.nodes.createNode(this,n);
        this.name = n.name;
        this.host = n.host;
        this.port = n.port;
        var node  = this;

        //tcpServerModule.setLogger(log);
        //serialServerModule.setLogger(log);

        var socket = net.createServer().listen(node.port, node.host);
        node.on('input', function() {
            // register / coil update values inside server
            // client connection should those be send to output ?? read and write as topics
        });
        node.on('close', function() {
            socket.close(); // destroy();
        });
        
        socket.on('end', function(e) {
            console.log("ending...");
            socket.close();
        });
        socket.on('close', function(e) {
            console.log("ending...");
            //socket.end();
        });
        socket.on('error', function (e) { 
            //cb(e); 
            console.log(e);
        });
        socket.on('connection', function (s) {
            var tcpServer = tcpServerModule.create(s);
            var server = serialServerModule.create(
                tcpServer,
                handler.Server.RequestHandler,
                handler.Server.ResponseHandler);
                cb(null, server);
        });
    }
    RED.nodes.registerType("modbus server tcp",ModbusServerTcpNode);
}
