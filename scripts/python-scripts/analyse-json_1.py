import json

# Open the JSON file
with open('./data/raw/latest/42birds.json') as file:
    data = json.load(file)

# Print the type of data variable
print(type(data))

# If it's a dict, you can print the keys to get a sense for the structure
if type(data) is dict:
    print(data.keys())

# If it's a list, you can print the first element to understand its structure
if type(data) is list:
    print(data[0])

# Assuming 'data' is your loaded JSON data

# Check the keys of the first product in the list
print(data['products'][0].keys())

# To get more in-depth view, you could also check the keys in the `variants` list
print(data['products'][0]['variants'][0].keys())    