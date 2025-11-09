use std::io::{self, Read};
use crabstep::{TypedStreamDeserializer, models::output_data::OutputData};
use crabstep::deserializer::iter::Property;

fn extract_strings_from_property(prop: &Property, strings: &mut Vec<String>) {
    // recursively traverse Property enum to find all String values
    match prop {
        Property::Primitive(data) => {
            if let OutputData::String(s) = data {
                strings.push(s.to_string());
            }
        }
        Property::Group(props) => {
            for p in props {
                extract_strings_from_property(p, strings);
            }
        }
        Property::Object { data, .. } => {
            for nested_prop in data.clone() {
                extract_strings_from_property(&nested_prop, strings);
            }
        }
    }
}

fn main() {
    let mut buffer = Vec::new();
    if let Err(e) = io::stdin().read_to_end(&mut buffer) {
        eprintln!("{{\"text\":null,\"success\":false,\"error\":\"Failed to read stdin: {}\"}}",
                 e.to_string().replace('\\', "\\\\").replace('"', "\\\""));
        std::process::exit(1);
    }
    
    if buffer.is_empty() {
        eprintln!("{{\"text\":null,\"success\":false,\"error\":\"No data received from stdin\"}}");
        std::process::exit(1);
    }
    
    let mut typedstream = TypedStreamDeserializer::new(&buffer);
    let mut all_strings = Vec::new();
    
    match typedstream.iter_root() {
        Ok(iter) => {
            for prop in iter {
                extract_strings_from_property(&prop, &mut all_strings);
            }
            let text = all_strings.join(" ");
            println!("{{\"text\":\"{}\",\"success\":true}}", 
                     text.replace('\\', "\\\\").replace('"', "\\\""));
        }
        Err(e) => {
            eprintln!("{{\"text\":null,\"success\":false,\"error\":\"Deserialization error: {:?}\"}}",
                     format!("{:?}", e).replace('\\', "\\\\").replace('"', "\\\""));
            std::process::exit(1);
        }
    }
}
