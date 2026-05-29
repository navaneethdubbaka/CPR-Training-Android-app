#include <Wire.h> // include I2C library
#include <i2c_touch_sensor.h>
#include <MPR121.h>

// Define pins for ultrasonic sensor
const int buttonPins[] = {2, 4, 6, 8, 10};
const int numButtons = sizeof(buttonPins) / sizeof(buttonPins[0]);
int buttonStates[numButtons];


const int pingPin = 12;
const int pingPin1=13;
const int analogSensorPin = A0;


// include our Grove I2C touch sensor library
// initialize the Grove I2C touch sensor
// IMPORTANT: in this case, INT pin was connected to pin7 of the Arduino 
// (this is the interrupt pin)
i2ctouchsensor touchsensor; // keep track of 4 pads' states


int k[]={0,0,0,0,0};
int g[]={0,0,0,0,0};
void setup() {
  Serial.begin(115200);
 Wire.begin(); // needed by the GroveMultiTouch lib     
   touchsensor.initialize(); // initialize the feelers     // initialize the containers    


  
      for (int i = 0; i < numButtons; i++) {
    pinMode(buttonPins[i], INPUT);
  }
}



void loop() {
  // Read ultrasonic sensor and display distance

touchsensor.getTouchState();

 if (touchsensor.touched&(1<<9))
 	{
 	k[0]=1;
         }
  else{
    	k[0]=0;
  }
 
if (touchsensor.touched&(1<<3))
 	{
 	k[1]=1;
         }
  else{
    	k[1]=0;
  }

  if (touchsensor.touched&(1<<8))
 	{
 	k[2]=1;
         }
  else{
    	k[2]=0;
  }
 
 if (touchsensor.touched&(1<<10))
 	{
 	k[3]=1;
         }
  else{
    	k[3]=0;
  }

  if (touchsensor.touched&(1<<11))
 	{
 	k[4]=1;
         }
  else{
    	k[4]=0;
  }


 


// Check for touch sensor input and print status
  for (int i = 0; i < 5; i++) {
     Serial.print(k[i]);
   
      Serial.print(",");
//  
  }



long duration, cm;

  // The PING))) is triggered by a HIGH pulse of 2 or more microseconds.
  
  // Give a short LOW pulse beforehand to ensure a clean HIGH pulse:
  pinMode(pingPin, OUTPUT);
  digitalWrite(pingPin, LOW);
  delayMicroseconds(2);
  digitalWrite(pingPin, HIGH);
  delayMicroseconds(5);
  digitalWrite(pingPin, LOW);

  // The same pin is used to read the signal from the PING))): a HIGH pulse
  // whose duration is the time (in microseconds) from the sending of the ping
  // to the reception of its echo off of an object.
  pinMode(pingPin1, INPUT);
  duration = pulseIn(pingPin1, HIGH);

  // convert the time into a distance
 
  cm = microsecondsToCentimeters(duration);



  
 
  //Serial.print("Distance: ");
  Serial.print(cm);
  Serial.print(",");

  // Read analog sensor and display voltage
  int analogValue = analogRead(analogSensorPin);
  float voltage = analogValue * (5.0 / 1023.0);
 // Serial.print("Analog Voltage: ");
  Serial.print(voltage, 2);
  Serial.print(",");

 for (int i = 0; i < 5; i++) {
    if (digitalRead(buttonPins[i]) == HIGH) {
      //Serial.print("Touch Sensor ");
      Serial.print("1");
      Serial.print(",");
//      digitalWrite(ledPins[i], HIGH);
    } else {
  //    digitalWrite(ledPins[i], LOW);
       Serial.print("0");
      Serial.print(",");
    }
   // Serial.println();
  }


 
  Serial.println();

  // Add a delay of 200 milliseconds
  delay(100);
}

long microsecondsToInches(long microseconds) {
  // According to Parallax's datasheet for the PING))), there are 73.746
  // microseconds per inch (i.e. sound travels at 1130 feet per second).
  // This gives the distance travelled by the ping, outbound and return,
  // so we divide by 2 to get the distance of the obstacle.
  // See: https://www.parallax.com/package/ping-ultrasonic-distance-sensor-downloads/
  return microseconds / 74 / 2;
}

long microsecondsToCentimeters(long microseconds) {
  // The speed of sound is 340 m/s or 29 microseconds per centimeter.
  // The ping travels out and back, so to find the distance of the object we
  // take half of the distance travelled.
  return microseconds / 29 / 2;
}