# the commands

This file is written by `npm run commands` out of the program itself. Do
not edit it. Add the command and run the script again.

## connection

open, list and close service connections

```
connection [options] [command]
```

## connection open

open a connection on the register

```
connection open [options]
```

- `--account <number>` the account number the office says out loud
- `--name <name>` what the premise is called
- `--address <address>` where it is
- `--use <code>` premise use, one of RES_SINGLE, RES_MULTI, OFFICE, RETAIL, SCHOOL, HOSPITAL, MORTUARY, LAB, PLATING, FOOD_PROC, CAR_WASH, AGRI, WWTP, INDUSTRIAL, WAREHOUSE, MARINA, BREWERY, DAIRY, DRY_CLEANER, ICE_RINK, PRISON, HOTEL, DATA_CENTRE, FUEL_DEPOT, MUNICIPAL
- `--size <inches>` service size in inches
- `--on <date>` the day the service went in
- `--route <route>` the reading route it sits on
- `--fire` a dedicated fire line rather than a domestic service
- `--unmetered` the purveyor does not meter this service
- `--note <note>` anything the clerk wants on the file

## connection list

list the connections on the register

```
connection list [options]
```

- `--route <route>` only this route
- `--use <code>` only this premise use
- `--all` include the ones that have been disconnected

## connection show

show one connection

```
connection show [options] <id>
```

## connection retenant

record a change of premise use

```
connection retenant [options] <id>
```

- `--use <code>` the new premise use
- `--on <date>` the day it changed
- `--name <name>` the new premise name

## connection renumber

move a connection onto a new account number and nothing else

```
connection renumber [options] <id>
```

- `--account <number>` the new account number
- `--on <date>` the day it changed
- `--reason <reason>` why the billing system moved it

## connection close

take a connection off the register

```
connection close [options] <id>
```

- `--on <date>` the day it came out
- `--reason <reason>` why it came out

## survey

walk a premise and record what is on it

```
survey [options] [command]
```

## survey record

record a survey against a connection

```
survey record [options] <connection>
```

- `--on <date>` the day it was walked
- `--surveyor <name>` who walked it
- `--findings <codes>` finding codes, separated by commas
- `--refused` the surveyor was kept out
- `--note <note>` anything worth keeping

## survey show

show the survey the register is working from

```
survey show [options] <connection>
```

- `--history` show every survey rather than the current one

## survey due

the surveys that have fallen due

```
survey due [options]
```

## survey letters

write to the customers whose premise needs walking

```
survey letters [options]
```

- `--dry-run` work them out without writing anything
- `--route <route>` only this route
- `--body` print the text of the first letter

## survey findings

the finding codes a surveyor may write down

```
survey findings [options]
```

## uses

the premise use codes and what each one carries on its own

```
uses [options]
```

## model

the approved assembly list

```
model [options] [command]
```

## model add

put a model on the approval list

```
model add [options]
```

- `--id <id>` the model id the office quotes
- `--maker <maker>` who makes it
- `--model <model>` what they call it
- `--class <class>` the assembly class
- `--sizes <sizes>` the sizes it is listed at, separated by commas
- `--listed <date>` the day the laboratory listed it
- `--note <note>` anything worth keeping

## model delist

take a model off the list, leaving the fitted ones alone

```
model delist [options] <id>
```

- `--on <date>` the day it came off

## model list

the approval list

```
model list [options]
```

- `--class <class>` only this class

## model fleet

what the district has learned about each model

```
model fleet [options]
```

## assembly

what is in the ground

```
assembly [options] [command]
```

## assembly install

fit an assembly at a connection

```
assembly install [options] <connection>
```

- `--scope <scope>` containment or isolation
- `--class <class>` the assembly class
- `--model <id>` the model id off the approval list
- `--serial <serial>` the serial number on the body
- `--size <inches>` the size in inches
- `--on <date>` the day it went in
- `--location <where>` where the tester will find it

## assembly remove

take an assembly out

```
assembly remove [options] <id>
```

- `--on <date>` the day it came out
- `--reason <reason>` why

## assembly swap

replace one assembly with another on the same day

```
assembly swap [options] <id>
```

- `--class <class>` the class of the one going in
- `--model <id>` the model id of the one going in
- `--serial <serial>` its serial number
- `--size <inches>` its size
- `--on <date>` the day of the work
- `--location <where>` where it sits
- `--reason <reason>` why the old one came out

## assembly move

move an assembly to another point, under a new id

```
assembly move [options] <id>
```

- `--to <connection>` the connection it is going to
- `--scope <scope>` containment or isolation
- `--on <date>` the day of the work
- `--location <where>` where it sits now
- `--reason <reason>` why it moved

## assembly list

the assemblies on the register

```
assembly list [options]
```

- `--connection <id>` only this connection
- `--scope <scope>` only this point
- `--all` include the ones that have come out

## assembly remedy

whether a failing assembly may be repaired or has to be replaced

```
assembly remedy [options] <id>
```

## tester

certified testers

```
tester [options] [command]
```

## tester add

put a tester on the register

```
tester add [options]
```

- `--id <id>` the id the office files them under
- `--name <name>` their name
- `--agency <agency>` who issued the certificate
- `--certificate <number>` the certificate number
- `--issued <date>` the day it was issued
- `--expires <date>` the day it runs out
- `--endorsements <classes>` the classes it covers, separated by commas

## tester renew

write a renewed certificate onto a tester

```
tester renew [options] <id>
```

- `--issued <date>` the day the new one was issued
- `--expires <date>` the day it runs out
- `--endorsements <classes>` the classes it covers

## tester suspend

suspend a tester from the day given

```
tester suspend [options] <id>
```

- `--on <date>` the day the suspension starts
- `--reason <reason>` why

## tester list

the testers on the register and where their certificates stand

```
tester list [options]
```

## tester record

what one tester has filed and how the paperwork arrives

```
tester record [options] <id>
```

## tester roster

every tester with what they have filed, busiest first

```
tester roster [options]
```

## gauge

test gauges and their calibration

```
gauge [options] [command]
```

## gauge add

register a gauge to a tester

```
gauge add [options]
```

- `--id <id>` the gauge id
- `--tester <id>` the tester it belongs to
- `--maker <maker>` who made it
- `--serial <serial>` its serial number
- `--calibrated <date>` the day it was last calibrated
- `--accuracy <psid>` the band the laboratory certified it to
- `--interval <months>` months between calibrations

## gauge calibrate

record a calibration

```
gauge calibrate [options] <id>
```

- `--on <date>` the day it was done
- `--accuracy <psid>` the band on the new certificate

## gauge retire

retire a gauge

```
gauge retire [options] <id>
```

- `--on <date>` the day it was retired

## gauge list

the gauges a tester carries

```
gauge list [options] <tester>
```

## test

field test reports

```
test [options] [command]
```

## test file

file a test report against an assembly

```
test file [options] <assembly>
```

- `--tester <id>` who tested it
- `--gauge <id>` the gauge they used
- `--on <date>` the day of the test
- `--filed <date>` the day the paperwork arrived, today by default
- `--reading <key=value>` an as found reading, repeat for each
- `--as-left <key=value>` an as left reading, repeat for each
- `--repair <note>` what was put right
- `--remarks <note>` anything else on the form

## test history

the reports filed against an assembly

```
test history [options] <assembly>
```

## test form

the readings a procedure asks for

```
test form [options] <class>
```

## status

where one connection stands today

```
status [options] <connection>
```

- `--explain` say how every part of the answer was reached

## find

find a connection by an account, a name, an address or a serial number

```
find [options] <term>
```

- `--limit <count>` how many to print
- `--all` include the connections that have been taken off

## history

everything that has happened at one connection, in one column

```
history [options] <connection>
```

## standing

where the whole register stands, worst first

```
standing [options]
```

- `--route <route>` only this route
- `--only <standing>` only connections at this standing

## notice

the letters that go out

```
notice [options] [command]
```

## notice run

work out and write the letters due today

```
notice run [options]
```

- `--dry-run` work them out without writing anything
- `--route <route>` only this route
- `--limit <count>` stop after this many letters

## notice open

the letters nobody has answered yet

```
notice open [options]
```

## notice cancel

take a letter back

```
notice cancel [options] <id>
```

- `--on <date>` the day it was cancelled
- `--reason <reason>` why

## notice show

the letters on one connection, and what they said

```
notice show [options] <connection>
```

- `--body` print the text of the most recent one

## variance

variances against the requirement

```
variance [options] [command]
```

## variance apply

record an application from a customer

```
variance apply [options] <connection>
```

- `--accept <class>` the class the customer wants accepted
- `--on <date>` the day the application arrived
- `--scope <scope>` containment or isolation
- `--note <note>` what the customer says

## variance grant

grant an application on conditions

```
variance grant [options] <id>
```

- `--on <date>` the day of the decision
- `--from <date>` the day it takes effect
- `--conditions <list>` the conditions, separated by semicolons
- `--until <date>` the day it runs out
- `--note <note>` anything else

## variance deny

refuse an application

```
variance deny [options] <id>
```

- `--on <date>` the day of the decision
- `--reason <reason>` why

## variance revoke

revoke a granted variance

```
variance revoke [options] <id>
```

- `--on <date>` the day it stops
- `--reason <reason>` why

## variance list

the variances on file

```
variance list [options]
```

- `--connection <id>` only this connection
- `--in-effect` only the ones running today

## billing

the annual fee and the penalties

```
billing [options] [command]
```

## billing invoice

what one connection owes

```
billing invoice [options] <connection>
```

## billing run

the whole register, or one route of it

```
billing run [options]
```

- `--route <route>` only this route

## audit

who changed what, and when

```
audit [options] [command]
```

## audit trail

the trail for one thing

```
audit trail [options] <kind> <id>
```

## audit recent

the last things that happened

```
audit recent [options]
```

- `--kind <kind>` only this kind of event
- `--by <name>` only events this clerk caused
- `--since <timestamp>` only after this moment
- `--limit <count>` how many to print

## audit summary

what the trail is made of

```
audit summary [options]
```

## reinspection

record a visit an inspector had to make

```
reinspection [options] <connection>
```

- `--on <date>` the day of the visit
- `--note <note>` what they found

## export

write one of connections, assemblies, reports, standing out

```
export [options] <name>
```

- `--to <file>` write to a file rather than the terminal

## import-testers

take the certified tester list off the agency

```
import-testers [options] <file>
```

## import-connections

take the district in from the billing system

```
import-connections [options] <file>
```

- `--update` write changes onto the accounts that are already on file

## import

take a batch of test reports off a contractor file

```
import [options] <file>
```

- `--dry-run` say what would happen without writing anything

## summary

where the whole program stands

```
summary [options]
```

## schedule

what falls due month by month for the year ahead

```
schedule [options]
```

- `--months <count>` how many months to draw
- `--route <route>` only this route

## annual

the return the state asks for, for one calendar year

```
annual [options] <year>
```

- `--csv` write it as the state wants it rather than as columns

## worklist

what somebody should go and do, in route order

```
worklist [options]
```

- `--route <route>` only this route
- `--within <days>` look this many days ahead

## doctor

look for the things the store will hold and the office should not

```
doctor [options]
```

- `--faults-only` only the findings that are outright wrong

## backup

write a consistent copy of the register somewhere else

```
backup [options] <file>
```

## verify

ask sqlite whether the file itself is sound

```
verify [options]
```

## manual

print the reference tables the rules are read from

```
manual [options]
```

- `--section <title>` only the section whose title starts with this
- `--csv` write each section as a comma separated table

## demo

fill an empty register with a small district to train on

```
demo [options]
```

## config

show the policy in force and where it came from

```
config [options]
```

## shutoff

shutoff orders and restorations

```
shutoff [options] [command]
```

## shutoff raise

raise an order against a connection that is eligible today

```
shutoff raise [options] <connection>
```

- `--on <date>` the day the order is raised
- `--reason <reason>` what it is for

## shutoff execute

record that the crew went and the water is off

```
shutoff execute [options] <order>
```

- `--on <date>` the day they went
- `--crew <crew>` who went

## shutoff cancel

call an order off before the crew goes

```
shutoff cancel [options] <order>
```

- `--on <date>` the day it was called off
- `--reason <reason>` why

## shutoff restore

put the water back, if the register agrees it may go back

```
shutoff restore [options] <order>
```

- `--on <date>` the day the water went back on
- `--crew <crew>` who went
- `--note <note>` anything the crew found

## shutoff list

the orders that are open, or every order on one connection

```
shutoff list [options]
```

- `--connection <id>` only this connection, including the closed ones

## contact

who to write to and who to telephone

```
contact [options] [command]
```

## contact set

put somebody in a role, retiring whoever was in it

```
contact set [options] <connection>
```

- `--role <role>` one of account, site, plumber, emergency
- `--name <name>` their name
- `--on <date>` the day they took the role
- `--telephone <number>` a telephone number
- `--email <address>` an email address
- `--note <note>` anything worth knowing before ringing them

## contact retire

take somebody out of a role and put nobody in it

```
contact retire [options] <id>
```

- `--on <date>` the day they left it

## contact list

the contacts on a connection

```
contact list [options] <connection>
```

- `--all` include the ones who have been retired

## contact ring

who the office should telephone about this connection

```
contact ring [options] <connection>
```

