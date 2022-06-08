var slaveCheckList = [];
var deviceIDs = [];
var pairingMode = local.parameters.isPairing;
var colors1 = [];
var colors2 = [];

var alwaysUpdate = local.parameters.alwaysUpdate.get();
var lastUpdateTime = 0;

var updatingNames;

var broadcastPairIndex = 0;

for(var i=0;i<32;i++) 
{
	colors1[i] = [0,0,0];
	colors2[i] = [0,0,0];
	slaveCheckList[i] = false;
	deviceIDs[i]="0x000000";
}

local.parameters.output.listenToFeedback.set(true);
local.parameters.input.localPort.set(8889);

function init()
{
	detectRemote();
}

function update()
{
	if(!local.parameters.remoteConnected.get()) return;
	
	if(!pairingMode.get())
	{
		var time = util.getTime();

		if(time > lastCheckTime + 5) //check every 5 seconds
		{
			lastCheckTime = time;

			//send list request
			for(var i=0;i<32;i++) slaveCheckList[i] = false;
			sendMessage("glist");
			
		}

		if(alwaysUpdate) sendAllColors();
	}
}

function sendAllColors()
{
	if(isBlackoutMode()) return;

	var numPaired = local.values.connectedDevices.numPaired.get();
	var numConnected = local.values.connectedDevices.numConnected.get();

	for(var i=0;i<numPaired;i++)
	{
		//if(!slaveCheckList[i]) continue; //not connected
		var r1 = colors1[i][0];
		var g1 = colors1[i][1];
		var b1 = colors1[i][2];
		var r2 = colors2[i][0];
		var g2 = colors2[i][1];
		var b2 = colors2[i][2];

		if(groupMode)
		{
			var targetMask = 1 << i;
		}
		else
		{
			var targetMask=deviceIDs[i];
		}
		sendMessage("leach "+targetMask+","+r1+","+g1+","+b1+","+r2+","+g2+","+b2);
	}
	
}

function moduleParameterChanged(param)
{
	if(param.name == "pingAll")
	{
		ping("all",0,0,0);
	}else if(param.name == "blackOut")
	{
		if(!isGroupMode()) sendMessage("leach 0,-1,-1,-1,-1,-1,-1"); //fix for bug in firmware, selects all untis for gmute
		sendMessage("gmute 1");
		local.parameters.blackout.set(true);
	}else if(param.name == "pairNew_Group_")
	{
		pairingMode.set(true);
		sendMessage("gadd g1");
		script.log("Start new pairing group");
	}else if(param.name == "addToExisting_Group_")
	{
		pairingMode.set(true);
		sendMessage("gadd g0");
		script.log("Pair new devices to the group");
	}else if(param.name == "pairNew_Broadcast_")
	{
		pairingMode.set(true);
		sendMessage("gadd b1");
		script.log("Start new pairing group");
	}else if(param.name == "addToExisting_Broadcast_")
	{
		pairingMode.set(true);
		sendMessage("gadd b0");
	}else if(param.name == "finishPairing")
	{
		pairingMode.set(false);
		sendMessage("gstop");
		script.log("Finish pairing");
	}else if(param.name == "alwaysUpdate")
	{
		alwaysUpdate = local.parameters.alwaysUpdate.get();
	}else if(param.name == "remoteConnected")
	{
		if(local.parameters.remoteConnected.get())
		{
			sendMessage("mecho "+(local.parameters.enableEcho.get()?"1":"0"));
		} 
	}else if(param.getParent().name == "deviceNames")
	{
		if(!updatingNames)
		{
			var propID = parseInt(param.name.substring(6, param.name.length));
			var propMask = getMaskForTarget("one",propID,0,0);
			script.log("Changing of Device "+propID+" to "+param.get());
			sendMessage("gname "+propMask+","+param.get());
		}
		
	}else if(param.name == "enableEcho")
	{
		sendMessage("mecho "+(local.parameters.enableEcho.get()?"1":"0"));
	}else if(param.name == "blackout")
	{
		sendMessage("gmute "+(isBlackoutMode()?1:0));
	}
	else if(param.name == "detectRemote")
	{
		detectRemote();
	}
}

//Events
function dataReceived(data)
{


	if(data.substring(0,4) == "pbat")
	{
		if(!local.parameters.remoteConnected.get())
		{
			local.parameters.output.remoteHost.set(data.substring(5, data.length));
			local.parameters.remoteConnected.set(true);
			local.parameters.input.localPort.set(8889);
		}
	}




	if(data.substring(0,3) == "GRP")
	{
		var dataSplit = data.split(";");
		var pairingTarget = dataSplit[0].substring(6,dataSplit[0].length);

		if(pairingTarget == "master" || pairingTarget == "m")
		{
			var groupMode = dataSplit[dataSplit.length-1].substring(2,3) == "G";
			local.parameters.mode.set(groupMode?"Group":"Broadcast");

			//if(isGroupMode) l
			local.values.connectedDevices.numPaired.set(parseInt(dataSplit[2].substring(5, dataSplit[2].length)));
			broadcastPairIndex = 0;
		}else if(pairingTarget == "slave" || pairingTarget == "s") 
		{
			if(isGroupMode())
			{
				var propID = parseInt(dataSplit[1].substring(3,dataSplit[1].length));
				var deviceID = dataSplit[2].substring(3, dataSplit[2].length);
				var isOn = dataSplit[8].substring(8,9) == "+";
				var voltageString = dataSplit[5];
				var voltage = parseInt(voltageString.substring(4,voltageString.length)) / 0x10000;
				slaveCheckList[propID] = isOn;
				deviceIDs[propID] = deviceID;
				local.values.connectedDevices.getChild("device"+propID).set(isOn?voltage:0);
			
				sendMessage("gname "+getMaskForTarget("one",propID,0,0));
			}else //broadcast mode
			{
				var propID = broadcastPairIndex;
				//broadcastPairIndex++;
				var deviceID = dataSplit[1].substring(3, dataSplit[1].length);
				//deviceIDs[propID] = deviceID;
				//local.values.connectedDevices.numPaired.set(broadcastPairIndex);
				//sendMessage(voltageString);
				if(dataSplit.length <=3) //initial glist
				{
					sendMessage("ginfo "+deviceID);//getMaskForTarget("one",propID,0,0));
					sendMessage("glist "+deviceID);
					broadcastPairIndex++;
					deviceIDs[propID] = deviceID;
					return;
				}
				else // direct glist on specific deviceID
				{
					deviceIDs[propID] = deviceID;
					propID=getPropIDForDeviceID(deviceID);
					if(!(propID<0))
					{
					var voltageString = dataSplit[4];
					var isOn = true;
					slaveCheckList[propID] = isOn;
					var voltage = parseInt(voltageString.substring(4,voltageString.length)) / 0x10000;
					local.values.connectedDevices.getChild("device"+propID).set(isOn?voltage:0);
					}
				}
			}
			

			if(propID == local.values.connectedDevices.numPaired.get()-1)
			{
				var numConnected = 0;
				for(var i=0;i<32;i++) 
				{
					if(!slaveCheckList[i]) local.values.connectedDevices.getChild("device"+i).set(0);
					else numConnected++;
				}

				local.values.connectedDevices.numConnected.set(numConnected);
			}
		}
	}else if(data.substring(0,3) == "UDN")
	{
		updatingNames = true;
		var dataSplit = data.split(";");
		var propIDMask = parseInt(dataSplit[0].substring(7, dataSplit[0].length));
		var propName = dataSplit[1].substring(3, dataSplit[1].length);
		var propID = 0;
		while(propIDMask > 1)
		{
			propID++;
			propIDMask /= 2;
		} 
		local.parameters.deviceNames.getChild("device"+propID).set(propName);
		updatingNames = false;

	}else if(data.substring(0,3) == "INF")
	{
		updatingNames = true;
		var dataSplit = data.substring(4,data.length).split(";");
		var deviceID = dataSplit[0].substring(3, dataSplit[0].length);
		var propID = getPropIDForDeviceID(deviceID);
		var propName = dataSplit[5].substring(3, dataSplit[6].length);
		if(!(propID<0))local.parameters.deviceNames.getChild("device"+propID).set(propName);
		updatingNames = false;
	}
}


//Commands callbacks
function ping(target, propID, startID, endID)
{
	var targetMask = getMaskForTarget(target, propID, startID, endID);
	//sendMessage("lstop "+targetMask);
	sendMessage("gping "+targetMask);
}

function color(target, propID, startID, endID, mode, color1, color2)
{
	var targetMask = getMaskForTarget(target, propID, startID, endID);

	//Invert b and r because of inversion in the remote firmware 
	var r1 = parseInt(color1[0]*255);
	var g1 = parseInt(color1[1]*255);
	var b1 = parseInt(color1[2]*255);

	var r2=r1, g2=g1, b2=b1;

	if(mode == "ab")
	{
		r2 = parseInt(color2[0]*255);
		g2 = parseInt(color2[1]*255);
		b2 = parseInt(color2[2]*255);
	}else if(mode == "a")
	{
		//r1 = r2; g1 = g2; b1 = b2;
		r2 = -1; g2 = -1; b2 = -1;
	}else if(mode == "b")
	{
		r2 = r1; g2 = g1; b2 = b1;
		r1 = -1; g1 = -1; b1 = -1;
	}

	var col1 = [r1,g1,b1];
	var col2 = [r2,g2,b2];

	if(target == "one") 
	{
		if(mode != "b") colors1[propID] = col1;
		if(mode != "a") colors2[propID] = col2;
	}
	else if(target == "range")
	{
		var minID = Math.min(startID, endID);
		var maxID = Math.max(startID, endID);
		for(var i=minID;i <= maxID;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
		}
	}else if(target == "all") 
	{
		for(var i=0;i<32;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
		}
	}

	if(!alwaysUpdate) 
	{
		if(!local.parameters.remoteConnected.get()) return;
		sendMessage("leach "+targetMask+","+r1+","+g1+","+b1+","+r2+","+g2+","+b2);
		local.parameters.blackout.set(false);
	}
}

function startShow(target, propID, startID, endID, showID, delay, startTime, duration, brightness)
{
	var targetMask = getMaskForTarget(target, propId, startID, endID);
	var playCmd = "splay "+targetMask+","+(showID-1);
	if(delay > 0) playCmd += ",h"+parseInt(delay*1000);
	if(startTime > 0)  playCmd += ",o"+parseInt(startTime*1000);

	if(duration > 0) playCmd += ",d"+parseInt(duration*1000);
	playCmd += ",b"+parseInt(brightness-1);

	sendMessage(playCmd); //this number is 2^32 - 1
	local.parameters.blackout.set(false);
}

function stopShow(target, propID, startID, endID)
{
	var targetMask = getMaskForTarget(target, propId, startID, endID);
	sendMessage("sstop "+targetMask);
}

function brightness(val)
{
	sendMessage("bright "+(val-1));
}

function blackOut(val)
{
	local.parameters.blackout.set(val);
}




//Advanced functions

function lprog(target,propID,startID,endID,mode,Pattern,Pos1,Pos2,Pos3,Pos4,Pos5,Speed,brightness,color1,color2)
{
	var targetMask = getMaskForTarget(target, propID, startID, endID);


	//Invert b and r because of inversion in the remote firmware 
	var r1 = parseInt(color1[0]*255);
	var g1 = parseInt(color1[1]*255);
	var b1 = parseInt(color1[2]*255);

	var r2=r1, g2=g1, b2=b1;

	var message="lprog "+targetMask+",";

	if(mode == "ab")
	{
		message+="mB*Ac"+rgbToHex(r1,g1,b1);
	}else if(mode == "a")
	{
		//r1 = r2; g1 = g2; b1 = b2;
		//r2 = -1; g2 = -1; b2 = -1;
		message+="mAc"+rgbToHex(r1,g1,b1);
	}else if(mode == "b")
	{
		//r2 = r1; g2 = g1; b2 = b1;
		//r1 = -1; g1 = -1; b1 = -1;
		message+="mB"+rgbToHex(r1,g1,b1);
	}
	else
	{
		message+="mM*Ac"+rgbToHex(r1,g1,b1);
	}

	var pattern="";
	if(Pattern=="bank1") 
	{
			pattern="e0"+Pos1;
			message+=pattern;
	}
	else if(Pattern=="bank2")  
	{
			pattern="e1"+Pos2;
			message+=pattern;
	}
	else if(Pattern=="bank3")  
	{
			pattern="e2"+Pos3;
			message+=pattern;
	}
	else if(Pattern=="bank4")  
	{
			pattern="e3"+Pos4;
			message+=pattern;
	}
	else if(Pattern=="bank5")  
	{
			pattern="e4"+Pos5;
			message+=pattern;
	}
	else if(Pattern=="dots")  
	{
			pattern="eDO";
			message+=pattern;
	}
	else if(Pattern=="strobe")  
	{
			pattern="eST";
			message+=pattern;
	}
	else if(Pattern=="pulse")  
	{
			pattern="ePU";
			message+=pattern;
	}
	else if(Pattern=="fade")  
	{
			pattern="eFA";
			message+=pattern;
	}
	else if(Pattern=="flash")  
	{
			pattern="eFL";
			message+=pattern;
	}

	message+="b"+(brightness-1);

	message+="s"+(Speed-1);

	if(mode == "ab")
	{
		r2 = parseInt(color2[0]*255);
		g2 = parseInt(color2[1]*255);
		b2 = parseInt(color2[2]*255);
		message+="*Bc"+rgbToHex(r2,g2,b2);
		message+=pattern;
		message+="b"+brightness;
		message+="s"+Speed;
	}

	var col1 = [r1,g1,b1];
	var col2 = [r2,g2,b2];

	if(target == "one") 
	{
		if(mode != "b") colors1[propID] = col1;
		if(mode != "a") colors2[propID] = col2;
	}
	else if(target == "range")
	{
		var minID = Math.min(startID, endID);
		var maxID = Math.max(startID, endID);
		for(var i=minID;i <= maxID;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
		}
	}else if(target == "all") 
	{
		for(var i=0;i<32;i++)
		{
			if(mode != "b") colors1[i] = col1;
			if(mode != "a") colors2[i] = col2;
		}
	}

	if(!alwaysUpdate) 
	{
		if(!local.parameters.remoteConnected.get()) return;
		sendMessage(message);
		local.parameters.blackout.set(false);
	}
}


function gradient(startID, endID, color1, color2)
{
	
	if(startID == endID) 
	{
		color("one",startID,0,0,color1);
		return;
	}

	//Invert b and r because of inversion in the remote firmware 
	var r1 = color1[0];
	var g1 = color1[1];
	var b1 = color1[2];

	var r2 = color2[0];
	var g2 = color2[1];
	var b2 = color2[2];

	var targetMask = 0;
	var minID = Math.min(startID, endID);
	var maxID = Math.max(startID, endID);

	for(var i=minID;i<=maxID;i++)
	{
		var p = (i-minID)*1.0/(maxID-minID);

		var r = parseInt((r1+(r2-r1)*p)*255);
		var g = parseInt((g1+(g2-g1)*p)*255);
		var b = parseInt((b1+(b2-b1)*p)*255);

		colors1[i] = [r,g,b];
		colors2[i] = colors1[i];
		
		if(!alwaysUpdate) 
		{
			if(!local.parameters.remoteConnected.get()) return;
		if(isGroupMode())
		{
			targetMask = 1 << i;
		}
		else
		{
			targetMask=deviceIDs[i];
		}
			sendMessage("leach "+targetMask+","+r+","+g+","+b+","+r+","+g+","+b);
			local.parameters.blackout.set(false);
		}
	} 
	
}

function point(startID, endID, position, size, fade, color)
{
	var r = color[0];
	var g = color[1];
	var b = color[2];

	var r1=r;
	var g1=g;
	var b1=b;

	for(var i=startID;i<=endID;i++)
	{
		var p = (i-startID)*1.0/(endID-startID);

		if(Math.abs(position-p) < size) 
		{
			var fac = Math.min(Math.max(1-Math.abs((p-position)*fade*3/size),0),1);
			colors1[i] = [parseInt(r*fac*255), parseInt(g*fac*255), parseInt(b*fac*255)];

			 r1 = parseInt(r*fac*255);
			 g1 = parseInt(g*fac*255);
			 b1 = parseInt(b*fac*255);

		}
		else 
			{
				colors1[i] = [0,0,0];
				r1=0;
				g1=0;
				b1=0;

			}

		colors2[i] = colors1[i];
	

	
	if(!alwaysUpdate)
	{
		if(!local.parameters.remoteConnected.get()) return;
		if(isGroupMode())
		{
			targetMask = 1 << i;
		}
		else
		{
			targetMask=deviceIDs[i];
		}
		sendMessage("leach "+targetMask+","+r1+","+g1+","+b1+","+r1+","+g1+","+b1);
		local.parameters.blackout.set(false);
	}
}
}

//Helpers
function getMaskForTarget(target, propID, startID, endID)
{
	if(target == "all") return isGroupMode()?4294967295:0;
	else if(target == "one") return isGroupMode()?1 << propID:deviceIDs[propID];
	else if(target == "range") 
	{
		var targetMask = 0;
		var minID = Math.min(startID, endID);
		var maxID = Math.max(startID, endID);
		for(var i=minID;i<=maxID;i++) targetMask += (1 << i);
		return targetMask;
	}

	return 0;
}

function componentToHex(c) {

	var firstdigit="";
	var seconddigit="";	 
 	var divider;

var temp=c%16;
 seconddigit=temp< 0 ? Math.ceil(temp) : Math.floor(temp);


		if (seconddigit>=15) 
		{
			seconddigit="F";
		}
		else if(seconddigit>=14)
		{
			seconddigit="E";
		}
		else if(seconddigit>=13)
		{
			seconddigit="D";
		}
		else if(seconddigit>=12)
		{
			seconddigit="C";
		}
		else if(seconddigit>=11)
		{
			seconddigit="B";
		}
		else if(seconddigit>=10)
		{
			seconddigit="A";
		}
		else if (seconddigit>=9) 
		{
			seconddigit="9";
		}
		else if(seconddigit>=8)
		{
			seconddigit="8";
		}
		else if(seconddigit>=7)
		{
			seconddigit="7";
		}
		else if(seconddigit>=6)
		{
			seconddigit="6";
		}
		else if(seconddigit>=5)
		{
			seconddigit="5";
		}
		else if(seconddigit>=4)
		{
			seconddigit="4";
		}
		else if(seconddigit>=3)
		{
			seconddigit="3";
		}
		else if(seconddigit>=2)
		{
			seconddigit="2";
		}
		else if(seconddigit>=1)
		{
			seconddigit="1";
		}
		else if (seconddigit>=0)
		{
		 	seconddigit="0";
		}


if (seconddigit==0)
{
 seconddigit="0";
}


 divider=c/16;
 temp=divider%16;
 firstdigit=temp < 0 ? Math.ceil(temp) : Math.floor(temp);

		if (firstdigit>=15) 
		{
			firstdigit="F";
		}
		else if(firstdigit>=14)
		{
			firstdigit="E";
		}
		else if(firstdigit>=13)
		{
			firstdigit="D";
		}
		else if(firstdigit>=12)
		{
			firstdigit="C";
		}
		else if(firstdigit>=11)
		{
			firstdigit="B";
		}
		else if(firstdigit>=10)
		{
			firstdigit="A";
		}
		else if (firstdigit>=9) 
		{
			firstdigit="9";
		}
		else if(firstdigit>=8)
		{
			firstdigit="8";
		}
		else if(firstdigit>=7)
		{
			firstdigit="7";
		}
		else if(firstdigit>=6)
		{
			firstdigit="6";
		}
		else if(firstdigit>=5)
		{
			firstdigit="5";
		}
		else if(firstdigit>=4)
		{
			firstdigit="4";
		}
		else if(firstdigit>=3)
		{
			firstdigit="3";
		}
		else if(firstdigit>=2)
		{
			firstdigit="2";
		}
		else if(firstdigit>=1)
		{
			firstdigit="1";
		}
		else if (firstdigit>=0)
		{
		 	firstdigit="0";
		}

  return firstdigit+seconddigit;
}

function rgbToHex(r, g, b) {
  return "0x" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function sendMessage(message)
{
	local.send(message+"\n");
}

function isGroupMode()
{
	return local.parameters.mode.get() == "group";
}

function isBlackoutMode()
{
	return local.parameters.blackout.get();
}


function getPropIDForDeviceID(deviceID)
{
	for(var i=0;i<broadcastPairIndex;i++)
	{
		if(deviceIDs[i] == deviceID) return i;
	}

	return -1;
}


//Connection function
function detectRemote()
{
	local.parameters.remoteConnected.set(false);
	sendMessage("pbat");
	
	var ips = util.getIPs();
	for(var i=ips.length-1;i>=0;i--)
	{
		if(ips[i] == "127.0.0.1") continue;
		if(local.parameters.remoteConnected.get()) return;
		var b = ips[i].split(".");
		for(var j=0;j<=254;j++)
		{
			var broadcast = b[0]+"."+b[1]+"."+b[2]+"."+j;
			local.parameters.output.remoteHost.set(broadcast);
			//sendMessage(broadcast);
			sendMessage("mecho 1");
			sendMessage("pbat "+broadcast);
		}
	}
	
}

function sendMessage(message)
{
	local.send(message+"\n");
}