#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>

const char* ssid = "David";
const char* password = "gunawantj";

const char* host = "192.168.1.7";
const uint16_t port = 3000;

WebSocketsClient webSocket;

const int relayPin = D4;
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length)
{
    switch(type)
    {
        case WStype_CONNECTED:

            Serial.println("Connected Server");

            webSocket.sendTXT(
              "{\"type\":\"esp\"}"
            );

            break;

        case WStype_TEXT:
        {
            String msg = String((char*)payload);

            if(msg.indexOf("ON") >= 0)
            {
                Serial.println("RELAY ON");
                digitalWrite(relayPin, LOW);
            }

            if(msg.indexOf("OFF") >= 0)
            {
                Serial.println("RELAY OFF");
                digitalWrite(relayPin, HIGH);
            }
            break;
        }
    }
}

void setup()
{
    Serial.begin(115200);

    pinMode(relayPin, OUTPUT);
    digitalWrite(relayPin, HIGH);

    WiFi.begin(ssid,password);

    while(WiFi.status()!=WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    Serial.println("WiFi Connected");

    webSocket.begin(host,port,"/");
    webSocket.onEvent(webSocketEvent);
}

void loop()
{
    webSocket.loop();
}