# Passwords and sign-in

Fictional demo data. Northwind Cloud is an invented company and none of the behavior below describes a real product.

## Resetting a password

Choose "Forgotten password" on the sign-in screen and enter the address on the account. The reset link arrives within a minute and expires after 60 minutes. Using a link invalidates every other reset link issued for that account.

A reset signs the account out of every device, including mobile.

## Password rules

A Northwind Cloud password is at least 12 characters and cannot repeat any of the last five passwords used on the account. There is no forced rotation: a password is changed when someone chooses to change it.

## Locked accounts

Ten failed sign-in attempts inside 15 minutes lock an account for 30 minutes. A workspace administrator can clear the lock immediately from the Members screen.

## Two-factor sign-in

Two-factor sign-in uses an authenticator app. SMS codes are not offered. Turning it on issues eight single-use recovery codes, and turning it off and on again replaces all eight.

A workspace administrator can require two-factor sign-in for every member on Current and Tidal. Drift workspaces can turn it on per member but cannot require it.

## Sessions

A signed-in session lasts 30 days of inactivity before it expires. Signing out of one device leaves the others signed in, unless the password was reset.
