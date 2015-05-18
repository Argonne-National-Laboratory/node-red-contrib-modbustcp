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
 NodeRed node with support for MODBUS items read/write function codes and register/coil addresses based on modbus protocol specifications.

 @author <a href="mailto:mika.karaila@valmet.com">Mika Karaila</a> (Valmet Automation Inc.)
**/

module.exports = function(RED) {
    "use strict";
    var RED = require(process.env.NODE_RED_HOME+"/red/red");

    function ModbusItemNode(n) {
        RED.nodes.createNode(this,n);
        this.fc = n.fc;             // MODBUS Function Code, fc=1 coil_cnt=2
        this.address = n.address;   // MODBUS register/coil number
        this.count = n.count;       // MODBUS register/coil count to read/write
        this.value = n.value;       // value if not in payload
        this.name = n.name;         // Logical name for register/coil
        var node = this;
        var msg = {};
        
        node.on("input", function(msg) {
            msg.topic = node.name;
            msg.fc = parseInt(node.fc);
            if (msg.fc==1) {
                msg.start=parseInt(node.address);
                msg.count=parseInt(node.count);
            }
            if (msg.fc==2) {
                msg.start=parseInt(node.address);
                msg.count=parseInt(node.count);
            }
            if (msg.fc==3) {
                msg.start=parseInt(node.address);
                msg.count=parseInt(node.count);
            }
            if (msg.fc==4) {
                msg.start_reg=parseInt(node.address); // TODO change to msg.start as above
                msg.end_reg=parseInt(node.address)+parseInt(node.count)-1;   // TODO count instead of end_reg or calculate from address and count ??
            }
            if (msg.fc==5) {
                msg.coil=parseInt(node.address);
                if (msg.value) {
                    msg.payload=node.value;
                }
            }
            if (msg.fc==6) {
                msg.start=parseInt(node.address);
                if (msg.value) {
                    msg.payload=node.value;
                }
            }
            if (msg.fc==15) {
                msg.start=parseInt(node.address);
                msg.end_reg=parseInt(node.address)+parseInt(node.count);
                if (msg.value) {
                    msg.payload=node.value;
                }
            }
            if (msg.fc==16) {
                msg.start=parseInt(node.address);
                msg.end_reg=parseInt(node.address)+parseInt(node.count);
                if (msg.value) {
                    msg.payload=node.value;
                }
            }
            node.send(msg);
        });
    }
    RED.nodes.registerType("ModbusItem", ModbusItemNode);
}