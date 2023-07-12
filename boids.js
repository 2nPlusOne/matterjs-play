// import Matter.js library plugin
Matter.use('matter-wrap');

// Define 'Example' object if not already defined
var Example = Example || {};

Example.boids = function () {
  var Engine = Matter.Engine,
    Events = Matter.Events,
    Render = Matter.Render,
    Runner = Matter.Runner,
    World = Matter.World,
    Body = Matter.Body,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint;

  var BOIDS_COUNT = 100;
  var BOID_RADIUS = 4;
  var BOID_COLOR = '#ffffff';

  // adjust these factors to see the effect
  var ALIGNMENT_FACTOR = 1; 
  var COHESION_FACTOR = 1;
  var SEPARATION_FACTOR = 1;
  var VIEW_RADIUS = 100;

  var engine = Engine.create();
  engine.world.gravity.y = 0;
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: window.innerWidth,
      height: window.innerHeight,
      wireframes: false,
    }
  });
  
  var runner = Runner.create();
  Runner.run(runner, engine);
  Render.run(render);
  
  var world = engine.world;
  
  var createBoid = function (x, y) {
    var boid = Bodies.circle(x, y, BOID_RADIUS, {
      frictionAir: 0.01,
      render: {
        fillStyle: BOID_COLOR
      },
      plugin: {
        wrap: {
          min: { x: 0, y: 0 },
          max: { x: window.innerWidth, y: window.innerHeight }
        }
      }
    });
    return boid;
  };

  for (var i = 0; i < BOIDS_COUNT; i++) {
    var x = Math.random() * window.innerWidth;
    var y = Math.random() * window.innerHeight;
    World.add(world, createBoid(x, y));
  }

  var getAlignment = function (boid, others) {
    var velocity = { x: 0, y: 0 };
    var count = 0;
    for (let other of others) {
      if (Matter.Vector.magnitude(Matter.Vector.sub(boid.position, other.position)) < VIEW_RADIUS) {
        velocity = Matter.Vector.add(velocity, other.velocity);
        count += 1;
      }
    }
    if (count > 0) {
      velocity = Matter.Vector.div(velocity, count);
      velocity = Matter.Vector.sub(velocity, boid.velocity);
      velocity = Matter.Vector.mult(velocity, ALIGNMENT_FACTOR); // multiply by alignment factor
      velocity = Matter.Vector.div(velocity, 8);
    }
    return velocity;
  };

  var getCohesion = function (boid, others) {
    var position = { x: 0, y: 0 };
    var count = 0;
    for (let other of others) {
      if (Matter.Vector.magnitude(Matter.Vector.sub(boid.position, other.position)) < VIEW_RADIUS) {
        position = Matter.Vector.add(position, other.position);
        count += 1;
      }
    }
    if (count > 0) {
      position = Matter.Vector.div(position, count);
      position = Matter.Vector.sub(position, boid.position);
      position = Matter.Vector.mult(position, COHESION_FACTOR); // multiply by cohesion factor
      position = Matter.Vector.div(position, 100);
    }
    return position;
  };

  var getSeparation = function (boid, others) {
    var position = { x: 0, y: 0 };
    for (let other of others) {
      if (Matter.Vector.magnitude(Matter.Vector.sub(boid.position, other.position)) < VIEW_RADIUS) {
        var diff = Matter.Vector.sub(boid.position, other.position);
        diff = Matter.Vector.div(diff, Matter.Vector.magnitudeSquared(diff));
        position = Matter.Vector.add(position, diff);
      }
    }
    position = Matter.Vector.mult(position, SEPARATION_FACTOR); // multiply by separation factor
    return position;
  };

  // apply a random starting velocity to all boids
  var boids = Composite.allBodies(world);
  for (let boid of boids) {
    Body.setVelocity(boid, { x: Math.random() * 10 - 5, y: Math.random() * 10 - 5 });
  }

  // apply alignment, cohesion and separation rules
  Events.on(engine, 'beforeUpdate', function (event) {
    var bodies = Composite.allBodies(engine.world);
    for (let boid of bodies) {
      var others = bodies.filter(function (other) { return other !== boid; });
      var alignment = getAlignment(boid, others);
      var cohesion = getCohesion(boid, others);
      var separation = getSeparation(boid, others);
      var velocity = Matter.Vector.add(boid.velocity, alignment);
      velocity = Matter.Vector.add(velocity, cohesion);
      velocity = Matter.Vector.add(velocity, separation);
      Body.setVelocity(boid, velocity);
    }
  });

  var mouse = Mouse.create(render.canvas);
  var mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.2,
      render: { visible: false },
    },
  });

  Composite.add(world, mouseConstraint);
  render.mouse = mouse;
  
  return {
    engine: engine,
    runner: runner,
    render: render,
    canvas: render.canvas,
    stop: function () {
      Render.stop(render);
      Runner.stop(runner);
    },
  };
};
