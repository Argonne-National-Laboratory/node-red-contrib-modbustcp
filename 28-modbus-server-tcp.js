/**
 * Copyright 2015 Valmet Automation Inc.
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

 @author <a href="mailto:mika.karaila@valmet.com">Mika Karaila</a> (Valmet Automation Inc.)
**/
module.exports = function(RED) {
    "use strict";
    var RED = require(process.env.NODE_RED_HOME+"/red/red");
    var settings = RED.settings;
    var util    = require('util');
    var jsmodbus  = require('./jsmodbus');

    function ModbusTcpNode(n) {
        RED.nodes.createNode(this,n);
        this.name = n.name;
        this.host = n.host;
        this.port = n.port;
        var node  = this;

        var client  = jsmodbus.createTCPClient(n.port, n.host),
        cntr        = 0,
        closeClient = function () {
            cntr += 1;
            if (cntr === 5) {
                client.close();
            }
        };

        node.on("input", function(msg) {
            if (msg.fc===1) // "readCoils"
            {
                client.readCoils (msg.coil, msg.coil_cnt, function (resp, err) { 
                    if (err) {
                        console.log(err);
                        closeClient();
                        return;
                    }
                    //console.log(resp);
                    if (resp) // && resp.coils.length() > 0)  // TODO end_reg - start_reg == resp.register.length()
                    {
                        msg.payload = resp.coils; // array of coil values true or false
                        node.send(msg);
                    }
                    closeClient();
                });
            }
            if (msg.fc===2) // "writeSingleCoil TODO check functionCode
            {
                client.writeSingleCoil (msg.coil, msg.payload, function (resp) {
                    if (resp) 
                    {
                        console.log("WriteSingleCoil done ok");
                        msg.payload = resp.payload; // value written
                        node.send(msg);
                    }
                    closeClient();
                });
            }
            if (msg.fc===3) // "readHoldingRegisters TODO check functionCode
            {
                client.readHoldingRegisters (msg.start, msg.count,function (resp) {
                    if (resp) // && resp.register.length() > 0)  // TODO end_reg - start_reg == resp.register.length()
                    {
                        msg.payload = resp.registers; // array of register values
                        node.send(msg);
                    }
                    closeClient();
                });
            }
            if (msg.fc===4) // "readInputRegister"
            {
                client.readInputRegister (msg.start_reg, msg.end_reg, function (resp) { 
                // console.log(resp);
                if (resp) // && resp.register.length() > 0)  // TODO end_reg - start_reg == resp.register.length()
                {
                    msg.payload = resp.register; // array of register values
                    node.send(msg);
                }
                closeClient(); 
                });
            }
            if (msg.fc===5) // "writeSingleCoil" (forceSingleCoil)
            {
                client.writeSingleCoil (msg.coil, msg.payload, function (resp) {
                    if (resp) 
                    {
                        console.log("WriteSingleCoil done!");
                        msg.payload = resp.payload; // value written
                        node.send(msg);
                    }
                    closeClient();
                });
            }
        });
    }
    RED.nodes.registerType("modbus tcp",ModbusTcpNode);
}
